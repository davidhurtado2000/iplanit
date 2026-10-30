import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getResendClient, getBusinessEmailsByReservation, NOTIFICATIONS_FROM_EMAIL } from '@/lib/email/resend'
import { buildReviewRequestEmail } from '@/lib/email/templates'
import type { Database } from '@/lib/supabase/types'

// Triggered by Vercel Cron, same convention as send-reminders/route.ts -
// Vercel sends Authorization: Bearer $CRON_SECRET automatically for
// scheduled invocations.
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.error('[iplanit] CRON_SECRET is not set - refusing all requests')
    return NextResponse.json({ error: 'not_configured' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase.rpc('get_reservations_needing_review_request')
  if (error) {
    console.error('[iplanit] Error fetching due review requests:', error)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  const replyToByReservation = await getBusinessEmailsByReservation(
    supabase,
    (data || []).map((r) => r.reservation_id)
  )
  let sent = 0
  let failed = 0

  for (const row of data || []) {
    try {
      const { subject, html } = buildReviewRequestEmail({
        clientName: row.client_name,
        businessName: row.business_name,
        googleReviewUrl: row.google_review_url,
        // No stored business language preference for this one (unlike
        // reminders, which read business_country) - defaulting to Spanish
        // matches every other business-facing default in this app.
        language: 'es',
      })

      await getResendClient().emails.send({
        from: NOTIFICATIONS_FROM_EMAIL,
        to: row.client_email,
        replyTo: replyToByReservation.get(row.reservation_id),
        subject,
        html,
      })

      await supabase
        .from('reservations')
        .update({ review_requested_at: new Date().toISOString() })
        .eq('id', row.reservation_id)

      sent++
    } catch (err) {
      console.error('[iplanit] Error sending review request for reservation', row.reservation_id, err)
      failed++
    }
  }

  return NextResponse.json({ sent, failed, total: (data || []).length })
}
