import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getStripeClient } from '@/lib/stripe'

// Creates a Stripe Checkout Session for the logged-in user and returns the
// URL to redirect them to - no Stripe.js/Elements needed since Checkout is
// a Stripe-hosted page. profiles.plan is per-user (not per-business, see
// scripts/027's comment on this), so this only needs the logged-in user,
// never the currently selected business.
export async function POST() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const priceId = process.env.STRIPE_PRICE_ID
  if (!priceId) {
    console.error('[iplanit] STRIPE_PRICE_ID is not set')
    return NextResponse.json({ error: 'not_configured' }, { status: 500 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://iplanit.io'
  const stripe = getStripeClient()

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // Reuse the existing Stripe customer if this user already has one
      // (e.g. a previous canceled subscription) instead of creating a
      // duplicate - Stripe customer creation only happens here, on demand,
      // rather than at signup, since most accounts never upgrade.
      customer: profile?.stripe_customer_id || undefined,
      customer_email: profile?.stripe_customer_id ? undefined : user.email,
      // Belt-and-suspenders alongside the customer link itself - the
      // webhook checks this first, so account linking still works even in
      // the unlikely case customer metadata is ever missing.
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id },
      subscription_data: { metadata: { supabase_user_id: user.id } },
      success_url: `${appUrl}/dashboard/settings?checkout=success`,
      cancel_url: `${appUrl}/dashboard/settings?checkout=cancelled`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[iplanit] Error creating Stripe checkout session:', err)
    return NextResponse.json({ error: 'checkout_failed' }, { status: 500 })
  }
}
