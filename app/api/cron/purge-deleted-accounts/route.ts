import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getResendClient, NOTIFICATIONS_FROM_EMAIL } from '@/lib/email/resend'
import { buildCancellationEmail } from '@/lib/email/templates'
import { getStripeClient } from '@/lib/stripe'
import type { Database } from '@/lib/supabase/types'

// Runs daily (see .github/workflows/purge-deleted-accounts-cron.yml) - same
// CRON_SECRET-bearer-token pattern as app/api/cron/send-reminders. Finalizes
// any account whose 30-day grace period (scripts/051) has passed: notifies
// clients with upcoming reservations, cancels any Stripe subscription, then
// calls auth.admin.deleteUser(), which cascades through every FK pointing
// at profiles/businesses (confirmed: all of them are ON DELETE CASCADE,
// there's no DB-level safety net - this route IS the safety net, via the
// 30-day window + /api/account/cancel-deletion).
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: accounts, error } = await supabase.rpc('get_accounts_ready_for_deletion')
  if (error) {
    console.error('[iplanit] Error fetching accounts ready for deletion:', error)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  let deleted = 0
  let failed = 0
  let noticesSent = 0

  for (const account of accounts || []) {
    try {
      // 1. Notify clients with an upcoming reservation before it disappears.
      const { data: reservations } = await supabase.rpc('get_reservations_needing_deletion_notice', {
        p_user_id: account.user_id,
      })

      for (const row of reservations || []) {
        try {
          const { subject, html } = buildCancellationEmail({
            clientName: row.client_name,
            businessName: row.business_name,
            serviceName: row.service_name ?? '',
            startTime: row.start_time,
            timezone: row.business_timezone,
            language: row.business_country === 'US' ? 'en' : 'es',
          })
          await getResendClient().emails.send({
            from: NOTIFICATIONS_FROM_EMAIL,
            to: row.client_email!,
            subject,
            html,
          })
          noticesSent++
        } catch (err) {
          // Best-effort - a single failed notice shouldn't block the
          // account deletion itself from proceeding.
          console.error('[iplanit] Error sending deletion notice for reservation', row.reservation_id, err)
        }
      }

      // 2. Cancel any active Stripe subscription immediately (not at
      // period end - the account won't exist to use it regardless).
      if (account.stripe_subscription_id) {
        try {
          await getStripeClient().subscriptions.cancel(account.stripe_subscription_id)
        } catch (err) {
          // Also best-effort - e.g. already cancelled/doesn't exist -
          // must not block the account deletion itself.
          console.error('[iplanit] Error cancelling Stripe subscription for', account.user_id, err)
        }
      }

      // 3. Delete the auth user - cascades through everything (see the
      // file-level comment above).
      const { error: deleteError } = await supabase.auth.admin.deleteUser(account.user_id)
      if (deleteError) throw deleteError

      deleted++
    } catch (err) {
      console.error('[iplanit] Error purging account', account.user_id, err)
      failed++
    }
  }

  return NextResponse.json({ deleted, failed, noticesSent, total: (accounts || []).length })
}
