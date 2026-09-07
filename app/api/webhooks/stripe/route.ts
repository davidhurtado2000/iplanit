import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { getStripeClient, getPlanItem, getAddonItem, getSeatItem, tierFromPriceId } from '@/lib/stripe'
import { getResendClient, NOTIFICATIONS_FROM_EMAIL } from '@/lib/email/resend'
import { buildTrialEndingEmail } from '@/lib/email/templates'
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

async function setPlanByUserId(userId: string, plan: 'free' | 'pro' | 'premium', extra: Record<string, string | boolean | number | null> = {}) {
  const { error } = await supabase.from('profiles').update({ plan, ...extra }).eq('id', userId)
  if (error) console.error('[iplanit] Error updating profile plan:', error)
}

async function setPlanByCustomerId(customerId: string, plan: 'free' | 'pro' | 'premium', extra: Record<string, string | boolean | number | null> = {}) {
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
    // New subscriptions are created directly via stripe.subscriptions.create
    // in app/api/stripe/subscribe/route.ts now (the embedded Stripe Elements
    // flow), which grants plan access synchronously in that same request -
    // trial-abuse detection (card fingerprint / email reuse) also lives
    // there now, since it has to run BEFORE the subscription is created to
    // let the user confirm the charge, which a webhook firing afterward
    // can't do. This case is kept only as a defensive fallback in case a
    // Checkout Session is ever created some other way (e.g. manually from
    // the Stripe Dashboard) - it is not the primary path anymore.
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.client_reference_id || session.metadata?.supabase_user_id
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
      const subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription?.id

      if (!userId || !customerId || !subscriptionId) {
        console.error('[iplanit] checkout.session.completed missing user/customer/subscription link', {
          userId,
          customerId,
          subscriptionId,
        })
        break
      }

      // Session objects don't carry price details unless expanded - one
      // extra retrieve to resolve which tier was actually purchased,
      // instead of trusting client-supplied checkout metadata.
      const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId)
      const tier = tierFromPriceId(getPlanItem(subscription)?.price.id)
      if (!tier) {
        console.error('[iplanit] checkout.session.completed: unrecognized price id', {
          priceId: getPlanItem(subscription)?.price.id,
        })
        break
      }

      await setPlanByUserId(userId, tier, {
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
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

      if (!isActive) {
        await setPlanByCustomerId(customerId, 'free', {
          stripe_subscription_id: null,
          ai_addon_active: false,
          extra_seats_purchased: 0,
        })
        break
      }

      // The subscription IS event.data.object here, and its price is
      // already a full object (never needs expand) - no extra API call,
      // unlike the checkout.session.completed case above. getPlanItem finds
      // the plan item specifically rather than assuming items.data[0] -
      // the AI add-on may be a second item on this same subscription, and
      // Stripe doesn't guarantee array order.
      const planItem = getPlanItem(subscription)
      const tier = tierFromPriceId(planItem?.price.id)
      if (!tier) {
        console.error('[iplanit] subscription event: unrecognized price id', {
          priceId: planItem?.price.id,
          customerId,
        })
        break
      }

      // Independent of the plan tier - deleting only the add-on item still
      // leaves the base subscription (and isActive) untouched, so this has
      // to be derived from item presence, not from the branch above. Same
      // reasoning for the seat item's quantity.
      const addonActive = !!getAddonItem(subscription)
      const extraSeats = getSeatItem(subscription)?.quantity ?? 0

      await setPlanByCustomerId(customerId, tier, {
        stripe_subscription_id: subscription.id,
        ai_addon_active: addonActive,
        extra_seats_purchased: extraSeats,
      })
      break
    }

    // Stripe fires this automatically ~3 days before a trial ends (fixed
    // schedule, not configurable via the API) - the mandatory heads-up
    // before the first real charge, so cancelling still feels like a real
    // choice rather than a surprise charge (see the FTC auto-renewal
    // discussion this feature was built around).
    case 'customer.subscription.trial_will_end': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email, language')
          .eq('stripe_customer_id', customerId)
          .single()
        if (!profile) break

        const tier = tierFromPriceId(getPlanItem(subscription)?.price.id)
        const priceUsd = tier === 'premium' ? 40 : 25
        const trialEndDate = new Date((subscription.trial_end ?? 0) * 1000)
        const language = profile.language === 'en' ? 'en' : 'es'

        const { subject, html } = buildTrialEndingEmail({ language, priceUsd, trialEndDate })
        await getResendClient().emails.send({
          from: NOTIFICATIONS_FROM_EMAIL,
          to: profile.email,
          subject,
          html,
        })
      } catch (err) {
        console.error('[iplanit] Error sending trial-ending email:', err)
      }
      break
    }

    default:
      break
  }

  return NextResponse.json({ received: true })
}
