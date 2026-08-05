import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getStripeClient, getPriceIdForTier } from '@/lib/stripe'

// Switches an EXISTING subscriber (already has an active subscription)
// between Pro and Premium by updating the price on their current
// subscription, instead of creating a second one via Checkout - Checkout
// always creates a brand-new subscription and would leave the customer
// paying for two plans at once (see app/api/stripe/checkout's
// already_subscribed guard). Stripe prorates the difference automatically.
//
// This never writes profiles.plan itself - the customer.subscription.updated
// webhook (app/api/webhooks/stripe/route.ts) picks up the price change and
// resolves the new tier from it, same single source of truth already used
// for new subscriptions.
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const tier: 'pro' | 'premium' | undefined = body?.tier
  if (tier !== 'pro' && tier !== 'premium') {
    return NextResponse.json({ error: 'invalid_tier' }, { status: 400 })
  }

  const newPriceId = getPriceIdForTier(tier)
  if (!newPriceId) {
    console.error(`[iplanit] STRIPE_PRICE_ID_${tier.toUpperCase()} is not set`)
    return NextResponse.json({ error: 'not_configured' }, { status: 500 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_subscription_id')
    .eq('id', user.id)
    .single()

  if (!profile?.stripe_subscription_id) {
    return NextResponse.json({ error: 'no_subscription' }, { status: 400 })
  }

  const stripe = getStripeClient()

  try {
    const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id)
    const item = subscription.items.data[0]

    if (!item) {
      console.error('[iplanit] change-plan: subscription has no items', {
        subscriptionId: profile.stripe_subscription_id,
      })
      return NextResponse.json({ error: 'change_failed' }, { status: 500 })
    }

    if (item.price.id === newPriceId) {
      return NextResponse.json({ error: 'already_on_plan' }, { status: 400 })
    }

    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      items: [{ id: item.id, price: newPriceId }],
      proration_behavior: 'create_prorations',
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[iplanit] Error changing Stripe subscription plan:', err)
    return NextResponse.json({ error: 'change_failed' }, { status: 500 })
  }
}
