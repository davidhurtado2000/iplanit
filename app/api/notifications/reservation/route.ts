import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getResendClient, NOTIFICATIONS_FROM_EMAIL } from '@/lib/email/resend'
import { buildConfirmationEmail, buildCancellationEmail, buildApprovedEmail, type EmailLanguage } from '@/lib/email/templates'
import type { Database } from '@/lib/supabase/types'

// Only { type, reservationId, language } come from the caller - every other
// field in the email (client name/email, business name, service, timezone)
// is re-fetched here from get_public_reservation_status instead of trusting
// whatever the request body says. Otherwise this endpoint would be an open
// relay: anyone could POST arbitrary "from iPlanit" emails to any address
// with attacker-chosen business/service text, which would eventually get
// iplanit.io's sending domain flagged as spam and break real delivery for
// every business on the platform. Reusing the same RPC the public
// manage-reservation page already calls means the trust boundary here is
// identical to that page's - a reservation id is effectively a bearer token
// (128-bit random uuid), same as everywhere else this pattern is used.
//
// That bearer-token trust boundary is exactly why this route also needs its
// own rate limit: a reservation id can leak (browser history, a forwarded
// link) to someone who isn't its owner, and unlike the public booking RPC
// this route had no volume cap at all - a leaked id let anyone trigger
// unlimited real emails to that client's inbox. A legitimate reservation
// only ever triggers 2-3 sends across its whole lifecycle (created,
// approved, cancelled), so a per-reservation cap here can be tight without
// ever bothering a real caller. See scripts/063-rate-limits.sql.
const RATE_LIMIT_WINDOW_MINUTES = 60
const RATE_LIMIT_MAX_SENDS = 5

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const type = body?.type as 'confirmation' | 'cancellation' | 'approved' | undefined
    const reservationId = body?.reservationId as string | undefined
    const language: EmailLanguage = body?.language === 'en' ? 'en' : 'es'

    if (type !== 'confirmation' && type !== 'cancellation' && type !== 'approved') {
      return NextResponse.json({ error: 'invalid_type' }, { status: 400 })
    }
    if (!reservationId) {
      return NextResponse.json({ error: 'missing_reservation_id' }, { status: 400 })
    }

    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('notification_send_log')
      .select('id', { count: 'exact', head: true })
      .eq('reservation_id', reservationId)
      .gte('created_at', windowStart)

    if ((count ?? 0) >= RATE_LIMIT_MAX_SENDS) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    const { data, error } = await supabase.rpc('get_public_reservation_status', {
      p_reservation_id: reservationId,
    })

    if (error || !data) {
      return NextResponse.json({ error: 'reservation_not_found' }, { status: 404 })
    }

    const reservation = data as unknown as {
      start_time: string
      client_name: string
      client_email: string | null
      service_name: string | null
      reservation_type: 'booking' | 'visit'
      business_name: string
      business_timezone: string
      notify_confirmations: boolean
      notify_cancellations: boolean
      // Additional attendees on a group reservation (scripts/081-group-
      // reservations.sql) - empty array for every normal 1:1 reservation.
      attendees: { name: string; email: string | null }[]
    }

    if (!reservation.client_email) {
      return NextResponse.json({ skipped: 'no_client_email' })
    }
    // 'approved' (business marks a pending reservation as confirmed) rides
    // the same toggle as 'confirmation' (the request-received email) - one
    // "notify about confirmations" preference covers both stages of the
    // same lifecycle rather than adding a 4th settings toggle for it.
    const enabled = type === 'cancellation' ? reservation.notify_cancellations : reservation.notify_confirmations
    if (!enabled) {
      return NextResponse.json({ skipped: 'notifications_disabled' })
    }

    const sharedEmailData = {
      businessName: reservation.business_name,
      serviceName: reservation.service_name,
      reservationType: reservation.reservation_type,
      startTime: reservation.start_time,
      timezone: reservation.business_timezone,
      language,
    }

    const buildEmail = (clientName: string, manageUrl?: string) => {
      const emailData = { ...sharedEmailData, clientName, manageUrl }
      return type === 'confirmation'
        ? buildConfirmationEmail(emailData)
        : type === 'approved'
          ? buildApprovedEmail(emailData)
          : buildCancellationEmail(emailData)
    }

    const primaryEmail = buildEmail(
      reservation.client_name,
      `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.iplanit.io'}/reservar/cita/${reservationId}`
    )
    await getResendClient().emails.send({
      from: NOTIFICATIONS_FROM_EMAIL,
      to: reservation.client_email,
      subject: primaryEmail.subject,
      html: primaryEmail.html,
    })

    // Additional attendees on a group reservation (scripts/081-group-
    // reservations.sql) get the same notification, personalized with their
    // own name - but no manageUrl, since that page can cancel the WHOLE
    // reservation and only the primary contact should hold that link.
    // Each send is independent so one bad address can't block the rest.
    for (const attendee of reservation.attendees ?? []) {
      if (!attendee.email) continue
      try {
        const attendeeEmail = buildEmail(attendee.name)
        await getResendClient().emails.send({
          from: NOTIFICATIONS_FROM_EMAIL,
          to: attendee.email,
          subject: attendeeEmail.subject,
          html: attendeeEmail.html,
        })
      } catch (err) {
        console.error('[iplanit] Error sending reservation email to attendee:', err)
      }
    }

    await supabase.from('notification_send_log').insert({ reservation_id: reservationId, type })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[iplanit] Error sending reservation email:', err)
    return NextResponse.json({ error: 'send_failed' }, { status: 500 })
  }
}
