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
export async function POST(request: Request) {
  const url = new URL(request.url)
  if (url.searchParams.get('secret') !== process.env.KOMMO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()

    // Kommo can batch multiple lead-status changes in one call
    // (leads[status][0][...], leads[status][1][...], ...) - walk indexes
    // until one is missing instead of only ever looking at [0].
    const lostLeadIds: string[] = []
    for (let i = 0; ; i++) {
      const leadId = formData.get(`leads[status][${i}][id]`)
      if (leadId === null) break
      const statusId = formData.get(`leads[status][${i}][status_id]`)
      if (String(statusId) === String(KOMMO_STATUS_LOST)) {
        lostLeadIds.push(String(leadId))
      }
    }

    if (lostLeadIds.length === 0) {
      return NextResponse.json({ ok: true, processed: 0 })
    }

    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    let cancelled = 0
    for (const leadId of lostLeadIds) {
      const { data: reservation } = await supabase
        .from('reservations')
        .select(
          `id, status, notes,
           clients ( email ),
           businesses ( country, notify_cancellations )`
        )
        .eq('kommo_lead_id', leadId)
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
          cancelled_by: 'business',
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

    return NextResponse.json({ ok: true, processed: cancelled })
  } catch (err) {
    console.error('[iplanit] Error handling Kommo webhook:', err)
    // Still 2xx - a malformed/unexpected payload from Kommo shouldn't make
    // Kommo think delivery failed and keep retrying it forever.
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
