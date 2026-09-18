import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getResendClient, NOTIFICATIONS_FROM_EMAIL } from '@/lib/email/resend'
import { buildReminderEmail } from '@/lib/email/templates'
import { sendWhatsappReminder } from '@/lib/twilio'
import type { Database } from '@/lib/supabase/types'

// Triggered by Vercel Cron (see vercel.json) - no logged-in user, so it
// can't rely on RLS like every other query in this app. Vercel
// automatically sends `Authorization: Bearer $CRON_SECRET` for scheduled
// invocations when that env var is set, which is checked below so this
// can't be hit by anyone who finds the URL.
export async function GET(request: Request) {
  // Fail closed, not open: without this check, an unset CRON_SECRET would
  // make the required header the literal, guessable string "Bearer
  // undefined" instead of rejecting every request outright.
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

  const { data, error } = await supabase.rpc('get_reservations_needing_reminders')
  if (error) {
    console.error('[iplanit] Error fetching due reminders:', error)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  // Off switch for the WhatsApp channel specifically - lets it stay wired up
  // and tested (see scripts/076-whatsapp-reminders.sql) without actually
  // sending anything while David isn't paying for Twilio. Unset/anything
  // other than 'true' means disabled (fail closed, same convention as
  // CRON_SECRET above). Flip to 'true' in .env.local / Vercel to resume -
  // no code change needed either way.
  const whatsappEnabled = process.env.WHATSAPP_REMINDERS_ENABLED === 'true'

  const rows = data || []
  let sent = 0
  let failed = 0
  let skipped = 0
  // Group reservations (scripts/081) now return one row per attendee
  // sharing the same reservation_id - reminder_sent_at/day_of_reminder_sent_at
  // are each one column on the reservation, so each must only be written
  // once per id, not once per recipient. Kept as two separate sets since a
  // reservation can legitimately need both kinds marked independently in
  // the same run (scripts/091-day-of-reminder.sql).
  const remindedReservationIds = new Set<string>()
  const dayOfRemindedReservationIds = new Set<string>()

  for (const row of rows) {
    try {
      const isDayOf = row.reminder_kind === 'day_of'
      const remindedSet = isDayOf ? dayOfRemindedReservationIds : remindedReservationIds

      // Email stays the default channel when a client has one - WhatsApp
      // only covers the clients who'd otherwise get no reminder at all
      // (see scripts/076-whatsapp-reminders.sql).
      if (row.client_email) {
        const { subject, html } = buildReminderEmail({
          clientName: row.client_name,
          businessName: row.business_name,
          serviceName: row.service_name,
          reservationType: row.reservation_type,
          startTime: row.start_time,
          timezone: row.business_timezone,
          language: row.business_country === 'US' ? 'en' : 'es',
          // Omitted for a group attendee (is_primary false) - that page
          // cancels the WHOLE reservation, only the primary contact
          // should hold that link.
          manageUrl: row.is_primary
            ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.iplanit.io'}/reservar/cita/${row.reservation_id}`
            : undefined,
          customMessage: row.reminder_email_message,
          isDayOf,
        })

        await getResendClient().emails.send({
          from: NOTIFICATIONS_FROM_EMAIL,
          to: row.client_email,
          subject,
          html,
        })
      } else if (row.client_phone) {
        if (!whatsappEnabled) {
          skipped++
          continue
        }
        await sendWhatsappReminder(row.client_phone)
      }

      // Marked right after a successful send, and only once per
      // reservation_id even across multiple rows (see comment above), so a
      // mid-batch failure never leaves an earlier success unmarked (which
      // would resend it next run) or a later row incorrectly marked before
      // it was actually sent.
      if (!remindedSet.has(row.reservation_id)) {
        remindedSet.add(row.reservation_id)
        const now = new Date().toISOString()
        await supabase
          .from('reservations')
          .update(isDayOf ? { day_of_reminder_sent_at: now } : { reminder_sent_at: now })
          .eq('id', row.reservation_id)
      }

      sent++
    } catch (err) {
      console.error('[iplanit] Error sending reminder for reservation', row.reservation_id, err)
      failed++
    }
  }

  return NextResponse.json({ sent, failed, skipped, total: rows.length })
}
