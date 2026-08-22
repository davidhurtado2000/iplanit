import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getStripeClient, getPriceIdForTier } from '@/lib/stripe'
import type { Database } from '@/lib/supabase/types'

// Step 2 of the embedded checkout flow - the card is already attached to
// the customer (via /api/stripe/setup-intent + stripe.confirmSetup() on the
// client) by the time this runs, so trial eligibility can be decided BEFORE
// any subscription/charge exists, unlike the old hosted-Checkout flow where
// the webhook only found out about a reused card after the fact. Replaces
// app/api/stripe/checkout/route.ts for new subscriptions.
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
  const paymentMethodId: string | undefined = body?.payment_method_id
  const confirmed: boolean = body?.confirmed === true

  if (tier !== 'pro' && tier !== 'premium') {
    return NextResponse.json({ error: 'invalid_tier' }, { status: 400 })
  }
  if (!paymentMethodId) {
    return NextResponse.json({ error: 'missing_payment_method' }, { status: 400 })
  }

  const priceId = getPriceIdForTier(tier)
  if (!priceId) {
    console.error(`[iplanit] STRIPE_PRICE_ID_${tier.toUpperCase()} is not set`)
    return NextResponse.json({ error: 'not_configured' }, { status: 500 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, stripe_customer_id, stripe_subscription_id')
    .eq('id', user.id)
    .single()

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: 'no_setup_intent' }, { status: 400 })
  }
  // Same guard as the old checkout route - this endpoint is for brand-new
  // subscriptions only, existing subscribers switch tiers through
  // /api/stripe/change-plan instead.
  if (profile.stripe_subscription_id) {
    return NextResponse.json({ error: 'already_subscribed' }, { status: 400 })
  }

  const stripe = getStripeClient()
  const serviceSupabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId)
    const fingerprint = paymentMethod.card?.fingerprint ?? null

    const [{ data: emailUsed }, fingerprintMatch] = await Promise.all([
      supabase.rpc('has_used_trial', { p_email: profile.email }),
      fingerprint
        ? serviceSupabase
            .from('trial_redemptions')
            .select('id')
            .eq('card_fingerprint', fingerprint)
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const alreadyUsedTrial = emailUsed === true || !!fingerprintMatch.data
    const priceUsd = tier === 'premium' ? 40 : 25

    if (alreadyUsedTrial && !confirmed) {
      // Nothing created yet, nothing charged - the client shows an explicit
      // "this card/email already had a trial, you'll be charged $X today"
      // dialog and retries with confirmed: true only if the user agrees.
      return NextResponse.json({ needsConfirmation: true, priceUsd })
    }

    const subscription = await stripe.subscriptions.create({
      customer: profile.stripe_customer_id,
      items: [{ price: priceId }],
      default_payment_method: paymentMethodId,
      ...(alreadyUsedTrial ? {} : { trial_period_days: 30 }),
      metadata: { supabase_user_id: user.id, tier },
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice'],
    })

    // Recorded regardless of payment outcome below - a trial slot was
    // offered/attempted for this email+card either way, which is what this
    // table exists to track (prevents re-litigating eligibility on a retry).
    await serviceSupabase.from('trial_redemptions').insert({
      email: profile.email.toLowerCase(),
      card_fingerprint: fingerprint,
      stripe_customer_id: profile.stripe_customer_id,
      stripe_subscription_id: subscription.id,
    })

    if (subscription.status === 'active' || subscription.status === 'trialing') {
      // Common case - the card didn't need a second (post-setup) SCA
      // challenge, so the invoice is already paid (or on trial). Grant
      // access synchronously instead of waiting on the webhook.
      await serviceSupabase
        .from('profiles')
        .update({ plan: tier, stripe_subscription_id: subscription.id })
        .eq('id', user.id)
      return NextResponse.json({ success: true })
    }

    // Some cards (and some banks) demand fresh 3D Secure authentication on
    // every charge, not just once when the card is first saved - the
    // SetupIntent confirmation on the client earlier isn't enough to cover
    // this actual invoice payment. Do NOT grant plan access yet: the
    // subscription is sitting 'incomplete' until that payment is confirmed.
    const invoice = subscription.latest_invoice
    const clientSecret = typeof invoice === 'object' ? invoice?.confirmation_secret?.client_secret : null
    if (clientSecret) {
      // customer.subscription.updated (app/api/webhooks/stripe/route.ts)
      // grants profiles.plan once Stripe sees this payment succeed and
      // flips the subscription to active - same mechanism already used for
      // renewals, no new webhook code needed for this path.
      return NextResponse.json({ requiresAction: true, clientSecret })
    }

    console.error('[iplanit] Subscription left incomplete with no actionable payment intent', {
      subscriptionId: subscription.id,
      status: subscription.status,
    })
    return NextResponse.json({ error: 'subscribe_failed' }, { status: 500 })
  } catch (err) {
    console.error('[iplanit] Error creating subscription:', err)
    return NextResponse.json({ error: 'subscribe_failed' }, { status: 500 })
  }
}
