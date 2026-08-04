import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getResendClient, NOTIFICATIONS_FROM_EMAIL } from '@/lib/email/resend'
import { buildReminderEmail } from '@/lib/email/templates'
import type { Database } from '@/lib/supabase/types'

// Triggered by Vercel Cron (see vercel.json) - no logged-in user, so it
// can't rely on RLS like every other query in this app. Vercel
// automatically sends `Authorization: Bearer $CRON_SECRET` for scheduled
// invocations when that env var is set, which is checked below so this
// can't be hit by anyone who finds the URL.
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase.rpc('get_reservations_needing_reminders')
  if (error) {
    console.error('[iplanit] Error fetching due reminders:', error)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  const rows = data || []
  let sent = 0
  let failed = 0

  for (const row of rows) {
    try {
      const { subject, html } = buildReminderEmail({
        clientName: row.client_name,
        businessName: row.business_name,
        serviceName: row.service_name,
        reservationType: row.reservation_type,
        startTime: row.start_time,
        timezone: row.business_timezone,
        language: row.business_country === 'US' ? 'en' : 'es',
        manageUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://iplanit.io'}/reservar/cita/${row.reservation_id}`,
      })

      await getResendClient().emails.send({
        from: NOTIFICATIONS_FROM_EMAIL,
        to: row.client_email!,
        subject,
        html,
      })

      // Marked right after a successful send, one row at a time, so a
      // mid-batch failure never leaves an earlier success unmarked (which
      // would resend it next run) or a later row incorrectly marked before
      // it was actually sent.
      await supabase
        .from('reservations')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', row.reservation_id)

      sent++
    } catch (err) {
      console.error('[iplanit] Error sending reminder for reservation', row.reservation_id, err)
      failed++
    }
  }

  return NextResponse.json({ sent, failed, total: rows.length })
}
