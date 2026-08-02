import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { getStripeClient } from '@/lib/stripe'
import type { Database } from '@/lib/supabase/types'

// Called directly by Stripe, not a logged-in user - the raw body + signature
// (verified below) is the only auth Stripe gives this endpoint, so it uses
// the service role key to write profiles.plan, same pattern as the reminder
// cron (app/api/cron/send-reminders). This is the ONLY path (besides a
// manual comp) allowed to touch plan/stripe_* now - see the column-level
// REVOKE in scripts/049-stripe-billing.sql.
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function setPlanByUserId(userId: string, plan: 'free' | 'premium', extra: Record<string, string | null> = {}) {
  const { error } = await supabase.from('profiles').update({ plan, ...extra }).eq('id', userId)
  if (error) console.error('[iplanit] Error updating profile plan:', error)
}

async function setPlanByCustomerId(customerId: string, plan: 'free' | 'premium', extra: Record<string, string | null> = {}) {
  const { error } = await supabase.from('profiles').update({ plan, ...extra }).eq('stripe_customer_id', customerId)
  if (error) console.error('[iplanit] Error updating profile plan by customer id:', error)
}

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: 'not_configured' }, { status: 500 })
  }

  // Must be the raw, unparsed body - Stripe's signature is computed over
  // the exact bytes it sent, so JSON.parse-then-stringify would break it.
  const rawBody = await request.text()

  let event: Stripe.Event
  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    console.error('[iplanit] Stripe webhook signature verification failed:', err)
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.client_reference_id || session.metadata?.supabase_user_id
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
      const subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription?.id

      if (!userId || !customerId) {
        console.error('[iplanit] checkout.session.completed missing user/customer link', { userId, customerId })
        break
      }

      await setPlanByUserId(userId, 'premium', {
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId || null,
      })
      break
    }

    // Covers renewals, cancellations-at-period-end taking effect later, and
    // payment failures - Stripe's subscription.status is the single source
    // of truth for whether access should currently be on or off.
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
      const isActive = subscription.status === 'active' || subscription.status === 'trialing'

      await setPlanByCustomerId(customerId, isActive ? 'premium' : 'free', {
        stripe_subscription_id: isActive ? subscription.id : null,
      })
      break
    }

    default:
      break
  }

  return NextResponse.json({ received: true })
}
