import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getResendClient, NOTIFICATIONS_FROM_EMAIL } from '@/lib/email/resend'
import { buildFeedbackNotificationEmail } from '@/lib/email/templates'
import type { Database } from '@/lib/supabase/types'

// Called by a Supabase Database Webhook configured on public.feedback
// (INSERT only) - not a logged-in user, so it's gated by a shared secret
// header the same way app/api/cron/send-reminders is, and fails closed if
// that secret isn't configured rather than falling back to a guessable
// default. scripts/061-feedback-rate-limit.sql caps how many rows a single
// user can insert per hour, which bounds how many emails this can ever
// fire even if someone scripts the insert directly against the API.
export async function POST(request: Request) {
  if (!process.env.FEEDBACK_WEBHOOK_SECRET) {
    console.error('[iplanit] FEEDBACK_WEBHOOK_SECRET is not set - refusing all requests')
    return NextResponse.json({ error: 'not_configured' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${process.env.FEEDBACK_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const destinationEmail = process.env.FEEDBACK_NOTIFICATION_EMAIL
  if (!destinationEmail) {
    console.error('[iplanit] FEEDBACK_NOTIFICATION_EMAIL is not set')
    return NextResponse.json({ error: 'not_configured' }, { status: 500 })
  }

  const body = await request.json().catch(() => null)
  // Only react to INSERT even though the webhook should already be scoped
  // to that event type in the Supabase dashboard - a defensive check in
  // case that config ever gets widened by accident.
  if (body?.type !== 'INSERT') {
    return NextResponse.json({ skipped: 'not_an_insert' })
  }

  const record = body?.record
  if (!record?.id || !record?.user_id || !record?.message) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [{ data: profile }, { data: business }] = await Promise.all([
    supabase.from('profiles').select('full_name, email').eq('id', record.user_id).single(),
    record.business_id
      ? supabase.from('businesses').select('name').eq('id', record.business_id).single()
      : Promise.resolve({ data: null }),
  ])

  const { subject, html } = buildFeedbackNotificationEmail({
    message: record.message,
    userEmail: profile?.email ?? record.user_id,
    userName: profile?.full_name ?? null,
    businessName: business?.name ?? null,
    pageUrl: record.page_url ?? null,
    createdAt: record.created_at ?? new Date().toISOString(),
  })

  try {
    await getResendClient().emails.send({
      from: NOTIFICATIONS_FROM_EMAIL,
      to: destinationEmail,
      subject,
      html,
    })
  } catch (err) {
    console.error('[iplanit] Error sending feedback notification email:', err)
    return NextResponse.json({ error: 'send_failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
