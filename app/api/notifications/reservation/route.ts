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
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

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
      service_name: string
      business_name: string
      business_timezone: string
      notify_confirmations: boolean
      notify_cancellations: boolean
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

    const emailData = {
      clientName: reservation.client_name,
      businessName: reservation.business_name,
      serviceName: reservation.service_name,
      startTime: reservation.start_time,
      timezone: reservation.business_timezone,
      language,
      manageUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://iplanit.io'}/reservar/cita/${reservationId}`,
    }

    const { subject, html } =
      type === 'confirmation'
        ? buildConfirmationEmail(emailData)
        : type === 'approved'
          ? buildApprovedEmail(emailData)
          : buildCancellationEmail(emailData)

    await getResendClient().emails.send({
      from: NOTIFICATIONS_FROM_EMAIL,
      to: reservation.client_email,
      subject,
      html,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[iplanit] Error sending reservation email:', err)
    return NextResponse.json({ error: 'send_failed' }, { status: 500 })
  }
}
