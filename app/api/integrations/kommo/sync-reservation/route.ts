import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { findOrCreateContact, createLead, getEnvKommoConfig, getBusinessKommoConfig, type KommoConfig } from '@/lib/kommo/client'
import type { Database } from '@/lib/supabase/types'

// Only { reservationId } comes from the caller, same "re-fetch everything
// server-side, never trust the body" shape as
// app/api/notifications/reservation/route.ts, for the same reason: a
// reservation id is effectively a bearer token (leaked link, browser
// history), so nothing about WHO the client/service/business is should
// come from the request itself.
//
// This route is wired into every reservation-creation flow (dashboard +
// public booking) for EVERY business on iPlanit, so it has to resolve a
// per-business KommoConfig before doing anything - phase 2's real
// per-business OAuth connection (kommo_integrations) takes priority; only
// David's own KOMMO_TEST_BUSINESS_ID falls back to phase 1's single shared
// env-based account, for the one business that was validated against that
// path before phase 2 existed. Any OTHER business with no active
// integration is skipped entirely - never falls back to David's account.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const reservationId = body?.reservationId as string | undefined

    if (!reservationId) {
      return NextResponse.json({ error: 'missing_reservation_id' }, { status: 400 })
    }

    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: reservation, error } = await supabase
      .from('reservations')
      .select(
        `id, client_id, business_id, start_time, price, price_usd, type, kommo_lead_id,
         clients ( name, phone, email, kommo_contact_id ),
         services ( name ),
         businesses ( name, currency )`
      )
      .eq('id', reservationId)
      .single()

    if (error || !reservation) {
      return NextResponse.json({ error: 'reservation_not_found' }, { status: 404 })
    }

    let kommoConfig: KommoConfig | null = await getBusinessKommoConfig(supabase, reservation.business_id)
    if (!kommoConfig && reservation.business_id === process.env.KOMMO_TEST_BUSINESS_ID) {
      kommoConfig = getEnvKommoConfig()
    }
    if (!kommoConfig) {
      return NextResponse.json({ skipped: 'business_not_connected' })
    }

    // Already synced (a retry, or someone re-triggering the same request
    // with a leaked reservation id) - skip instead of creating a second
    // lead for the same reservation in Kommo.
    if (reservation.kommo_lead_id) {
      return NextResponse.json({ skipped: 'already_synced' })
    }

    // A visit has no service and isn't real revenue (see Reservation.type
    // doc comment in dashboard-data-context.tsx) - not worth a lead yet in
    // this proof of concept. Only real bookings sync for now.
    if (reservation.type !== 'booking') {
      return NextResponse.json({ skipped: 'not_a_booking' })
    }

    const client = reservation.clients as unknown as {
      name: string
      phone: string | null
      email: string | null
      kommo_contact_id: string | null
    } | null
    const service = reservation.services as unknown as { name: string } | null
    const business = reservation.businesses as unknown as { name: string; currency: string } | null

    if (!client || (!client.phone && !client.email)) {
      return NextResponse.json({ skipped: 'no_contact_info' })
    }

    // Reuse the client's already-known Kommo contact instead of searching
    // by phone/email again - both faster, and this is the durable link the
    // future Kommo -> iPlanit direction needs (a webhook only carries a
    // Kommo contact_id, not this client's phone/email, so that lookup only
    // works if this id was saved on the client the first time around).
    let contactId: number
    if (client.kommo_contact_id) {
      contactId = Number(client.kommo_contact_id)
    } else {
      contactId = await findOrCreateContact(kommoConfig, {
        name: client.name,
        phone: client.phone,
        email: client.email,
      })
      await supabase
        .from('clients')
        .update({ kommo_contact_id: String(contactId) })
        .eq('id', reservation.client_id)
    }

    const dateLabel = new Date(reservation.start_time).toLocaleDateString('es-PE', {
      day: 'numeric',
      month: 'short',
      timeZone: 'America/Lima',
    })
    const leadName = service ? `${service.name} - ${dateLabel}` : `Reserva - ${dateLabel}`
    const price = business?.currency === 'USD' ? reservation.price_usd : reservation.price

    const leadId = await createLead(kommoConfig, {
      name: leadName,
      price,
      contactId,
    })

    await supabase
      .from('reservations')
      .update({ kommo_contact_id: String(contactId), kommo_lead_id: String(leadId) })
      .eq('id', reservationId)

    return NextResponse.json({ success: true, contactId, leadId })
  } catch (err) {
    console.error('[iplanit] Error syncing reservation to Kommo:', err)
    // Never surface this as a hard failure to the caller - the reservation
    // itself already exists and succeeded regardless of whether Kommo is
    // reachable right now (same "sync is always secondary" principle as
    // the notification route).
    return NextResponse.json({ error: 'sync_failed' }, { status: 200 })
  }
}
