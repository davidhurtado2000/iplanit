import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getResendClient, NOTIFICATIONS_FROM_EMAIL } from '@/lib/email/resend'
import { buildBirthdayEmail } from '@/lib/email/templates'
import type { Database } from '@/lib/supabase/types'

// Same skeleton as app/api/cron/send-reminders/route.ts - triggered by
// Vercel Cron (added directly in the Vercel dashboard; there's no
// vercel.json in this repo), no logged-in user so RLS doesn't apply here.
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

  const { data, error } = await supabase.rpc('get_clients_needing_birthday_email')
  if (error) {
    console.error('[iplanit] Error fetching due birthday emails:', error)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  const rows = data || []
  const currentYear = new Date().getFullYear()
  let sent = 0
  let failed = 0

  for (const row of rows) {
    try {
      const { subject, html } = buildBirthdayEmail({
        clientName: row.client_name,
        businessName: row.business_name,
        language: row.business_country === 'US' ? 'en' : 'es',
        discountPercent: row.discount_percent,
      })

      await getResendClient().emails.send({
        from: NOTIFICATIONS_FROM_EMAIL,
        to: row.client_email,
        subject,
        html,
      })

      // Marked right after a successful send, one row at a time - same
      // reasoning as send-reminders: a mid-batch failure should never leave
      // an earlier success unmarked (which would resend it tomorrow) or
      // skip marking a later row that never actually got sent.
      await supabase
        .from('clients')
        .update({ last_birthday_email_sent_year: currentYear })
        .eq('id', row.client_id)

      sent++
    } catch (err) {
      console.error('[iplanit] Error sending birthday email for client', row.client_id, err)
      failed++
    }
  }

  return NextResponse.json({ sent, failed, total: rows.length })
}
