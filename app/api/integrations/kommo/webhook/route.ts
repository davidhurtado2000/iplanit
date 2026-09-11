import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

// Kommo's own "Logrado con éxito" (Won) / "Venta Perdido" (Lost) statuses -
// read from this account's real pipeline (see lib/kommo/client.ts's own
// comment on why IDs here are read, not guessed). Only LOST is acted on:
// see the design note below for why WON deliberately does nothing.
const KOMMO_STATUS_LOST = 143

// Phase 1, Kommo -> iPlanit direction. Registered manually in Kommo's UI
// (Settings > Integrations > Web hooks - Kommo has no API for registering
// webhooks), pointing here with ?secret=KOMMO_WEBHOOK_SECRET appended,
// since Kommo doesn't sign its webhook payloads (no HMAC) - the secret in
// the URL is the only thing standing between this endpoint and anyone who
// finds it.
//
// Deliberately narrow in scope: only "lead marked Lost" cancels the
// matching iPlanit reservation, and only if that reservation hasn't
// already been resolved (completed/cancelled/no_show) - never overwrite
// history that already happened. "Lead marked Won" does NOT mark the
// reservation completed: Won means the sale closed, which can happen
// before the appointment itself does - flipping the reservation straight
// to "completed" would corrupt iPlanit's own no-show/completion tracking
// for something that hasn't happened yet. There's no safe automatic
// mapping for Won in this phase, so it's left alone on purpose.
//
// Also handles "contact added" -> creates a matching iPlanit client, with
// a loop guard: iPlanit creating a contact in Kommo (findOrCreateContact)
// fires this SAME event right back at us, so without the kommo_contact_id
// check below, every reservation synced FROM iPlanit would immediately
// create a duplicate client right back in iPlanit.
//
// And "contact edited" -> updates the phone/email on the iPlanit client
// ALREADY linked to that Kommo contact (never creates one - that's add's
// job), covering the common case of a contact first created with just a
// name (e.g. from inside a lead-creation flow) and filled in later.
export async function POST(request: Request) {
  const url = new URL(request.url)
  if (url.searchParams.get('secret') !== process.env.KOMMO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Which iPlanit business a Kommo account belongs to - phase 2's real
  // per-business connections first, falling back to David's own phase 1
  // test account (KOMMO_TEST_ACCOUNT_ID/KOMMO_TEST_BUSINESS_ID, no
  // kommo_integrations row since it was set up with a manually generated
  // token, not OAuth). Returns null for an account that isn't ours.
  async function resolveBusinessId(accountId: string): Promise<string | null> {
    const { data: integration } = await supabase
      .from('kommo_integrations')
      .select('business_id')
      .eq('kommo_account_id', accountId)
      .eq('status', 'active')
      .single()

    return (
      integration?.business_id ??
      (accountId === process.env.KOMMO_TEST_ACCOUNT_ID ? process.env.KOMMO_TEST_BUSINESS_ID ?? null : null)
    )
  }

  try {
    const formData = await request.formData()

    // Kommo can batch multiple lead-status changes in one call
    // (leads[status][0][...], leads[status][1][...], ...) - walk indexes
    // until one is missing instead of only ever looking at [0]. account_id
    // rides along on every entry - each Kommo account has its own separate
    // id-space for leads, so a bare kommo_lead_id match alone could collide
    // across two different businesses' accounts (both assign small
    // sequential-ish ids); account_id is what makes the match safe.
    const lostLeads: { leadId: string; accountId: string }[] = []
    for (let i = 0; ; i++) {
      const leadId = formData.get(`leads[status][${i}][id]`)
      if (leadId === null) break
      const statusId = formData.get(`leads[status][${i}][status_id]`)
      const accountId = formData.get(`leads[status][${i}][account_id]`)
      if (String(statusId) === String(KOMMO_STATUS_LOST) && accountId !== null) {
        lostLeads.push({ leadId: String(leadId), accountId: String(accountId) })
      }
    }

    // contacts[add][0][...], contacts[add][1][...], ... - same batching
    // shape as leads[status] above. Phone/email live in a nested
    // custom_fields array whose own indices aren't predictable (only
    // fields with a value set are included, in no guaranteed order), so
    // that's its own inner walk-until-missing loop, matched by `code`
    // rather than position.
    const newContacts: { contactId: string; accountId: string; name: string; phone: string | null; email: string | null }[] = []
    for (let i = 0; ; i++) {
      const contactId = formData.get(`contacts[add][${i}][id]`)
      if (contactId === null) break
      const accountId = formData.get(`contacts[add][${i}][account_id]`)
      const name = formData.get(`contacts[add][${i}][name]`)
      if (accountId === null || name === null) continue

      let phone: string | null = null
      let email: string | null = null
      for (let j = 0; ; j++) {
        const fieldCode = formData.get(`contacts[add][${i}][custom_fields][${j}][code]`)
        if (fieldCode === null) break
        const value = formData.get(`contacts[add][${i}][custom_fields][${j}][values][0][value]`)
        if (fieldCode === 'PHONE') phone = value !== null ? String(value) : null
        if (fieldCode === 'EMAIL') email = value !== null ? String(value) : null
      }

      newContacts.push({ contactId: String(contactId), accountId: String(accountId), name: String(name), phone, email })
    }

    let contactsCreated = 0
    for (const contact of newContacts) {
      const businessId = await resolveBusinessId(contact.accountId)
      if (!businessId) continue

      // Echo of iPlanit's own findOrCreateContact push, OR a contact we
      // already linked previously - either way, not a new person to add.
      const { data: alreadyLinked } = await supabase
        .from('clients')
        .select('id')
        .eq('business_id', businessId)
        .eq('kommo_contact_id', contact.contactId)
        .maybeSingle()
      if (alreadyLinked) continue

      // A genuinely new Kommo contact might still be someone iPlanit
      // already has as a client (existed before this integration, or
      // added by staff directly) - link instead of duplicating, matched
      // the same way create_public_reservation already dedupes (scripts/044).
      let existingClientId: string | null = null
      if (contact.email) {
        const { data } = await supabase
          .from('clients')
          .select('id')
          .eq('business_id', businessId)
          .ilike('email', contact.email)
          .maybeSingle()
        existingClientId = data?.id ?? null
      }
      if (!existingClientId && contact.phone) {
        const { data } = await supabase
          .from('clients')
          .select('id')
          .eq('business_id', businessId)
          .eq('phone', contact.phone)
          .maybeSingle()
        existingClientId = data?.id ?? null
      }

      if (existingClientId) {
        await supabase.from('clients').update({ kommo_contact_id: contact.contactId }).eq('id', existingClientId)
      } else {
        // organization_id intentionally omitted - check_client_limit()
        // (scripts/053) derives it from business_id automatically, same as
        // the dashboard's own "new client" form and CSV import already rely on.
        await supabase.from('clients').insert({
          business_id: businessId,
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          kommo_contact_id: contact.contactId,
        })
      }
      contactsCreated++
    }

    // contacts[update][0][...] - fires when an existing contact is edited
    // in Kommo (e.g. phone/email added after the contact was first created
    // with just a name). Unlike contacts[add] above, this only ever
    // touches a client iPlanit already linked via kommo_contact_id - it
    // never creates a new client (that's "add"'s job alone), and only
    // overwrites the fields this particular event actually carried a value
    // for, so an edit that only changed the email doesn't null out an
    // already-known phone.
    const updatedContacts: { contactId: string; accountId: string; phone: string | null; email: string | null }[] = []
    for (let i = 0; ; i++) {
      const contactId = formData.get(`contacts[update][${i}][id]`)
      if (contactId === null) break
      const accountId = formData.get(`contacts[update][${i}][account_id]`)
      if (accountId === null) continue

      let phone: string | null = null
      let email: string | null = null
      for (let j = 0; ; j++) {
        const fieldCode = formData.get(`contacts[update][${i}][custom_fields][${j}][code]`)
        if (fieldCode === null) break
        const value = formData.get(`contacts[update][${i}][custom_fields][${j}][values][0][value]`)
        if (fieldCode === 'PHONE') phone = value !== null ? String(value) : null
        if (fieldCode === 'EMAIL') email = value !== null ? String(value) : null
      }

      updatedContacts.push({ contactId: String(contactId), accountId: String(accountId), phone, email })
    }

    let contactsUpdated = 0
    for (const contact of updatedContacts) {
      const businessId = await resolveBusinessId(contact.accountId)
      if (!businessId) continue
      if (!contact.phone && !contact.email) continue // nothing this route tracks changed

      const { data: linkedClient } = await supabase
        .from('clients')
        .select('id')
        .eq('business_id', businessId)
        .eq('kommo_contact_id', contact.contactId)
        .maybeSingle()
      if (!linkedClient) continue // not a contact iPlanit is tracking - "add" handles new ones, this doesn't

      const patch: { phone?: string; email?: string } = {}
      if (contact.phone) patch.phone = contact.phone
      if (contact.email) patch.email = contact.email

      await supabase.from('clients').update(patch).eq('id', linkedClient.id)
      contactsUpdated++
    }

    if (lostLeads.length === 0) {
      return NextResponse.json({ ok: true, cancelled: 0, contactsCreated, contactsUpdated })
    }

    let cancelled = 0
    for (const { leadId, accountId } of lostLeads) {
      const businessId = await resolveBusinessId(accountId)
      if (!businessId) continue // unrecognized account - not one of ours

      const { data: reservation } = await supabase
        .from('reservations')
        .select(
          `id, status, notes,
           clients ( email ),
           businesses ( country, notify_cancellations )`
        )
        .eq('kommo_lead_id', leadId)
        .eq('business_id', businessId)
        .single()

      // No matching reservation (a lead unrelated to iPlanit, or one from
      // before this integration existed) - nothing to do, not an error.
      if (!reservation) continue
      // Already resolved - never let a late-arriving CRM signal overwrite
      // real history.
      if (reservation.status !== 'pending' && reservation.status !== 'confirmed') continue

      const note = '[Kommo] Cancelado automáticamente: el lead se marcó como Perdido.'

      await supabase
        .from('reservations')
        .update({
          status: 'cancelled',
          cancelled_by: 'kommo',
          cancelled_at: new Date().toISOString(),
          notes: reservation.notes ? `${reservation.notes}\n${note}` : note,
        })
        .eq('id', reservation.id)

      cancelled++

      // Same client-facing cancellation email a manual cancel would send -
      // from the client's side, their reservation disappeared either way,
      // so they should hear about it the same way regardless of which
      // system triggered it. Awaited (not fire-and-forget): this route
      // runs as a serverless function that can be frozen the instant the
      // response is sent, so an un-awaited call here isn't reliably
      // delivered.
      const business = reservation.businesses as unknown as { country: string; notify_cancellations: boolean } | null
      const client = reservation.clients as unknown as { email: string | null } | null
      if (business?.notify_cancellations && client?.email) {
        try {
          await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://www.iplanit.io'}/api/notifications/reservation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'cancellation',
              reservationId: reservation.id,
              language: business.country === 'US' ? 'en' : 'es',
            }),
          })
        } catch (err) {
          console.error('[iplanit] Error sending cancellation email from Kommo webhook:', err)
        }
      }
    }

    return NextResponse.json({ ok: true, cancelled, contactsCreated, contactsUpdated })
  } catch (err) {
    console.error('[iplanit] Error handling Kommo webhook:', err)
    // Still 2xx - a malformed/unexpected payload from Kommo shouldn't make
    // Kommo think delivery failed and keep retrying it forever.
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
