import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getStripeClient, getAiAddonPriceId, getAddonItem } from '@/lib/stripe'
import { meetsPlan } from '@/lib/plan-limits'
import type { Database } from '@/lib/supabase/types'

// Adds the AI add-on as a SECOND item on the customer's existing plan
// subscription - never a new subscription, never a new payment method.
// Billed to whatever card is already on file for that subscription. Writes
// profiles.ai_addon_active optimistically on success (same pattern as
// app/api/stripe/subscribe for the common case) - the Stripe webhook
// (customer.subscription.updated) confirms it independently afterward.
export async function POST() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const addonPriceId = getAiAddonPriceId()
  if (!addonPriceId) {
    console.error('[iplanit] STRIPE_PRICE_ID_AI_ADDON is not set')
    return NextResponse.json({ error: 'not_configured' }, { status: 500 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, stripe_subscription_id')
    .eq('id', user.id)
    .single()

  // Defense in depth - the Settings UI already only offers this to Pro/
  // Premium accounts, but the route itself must not trust that, since a
  // successful call here creates a real recurring charge.
  if (!meetsPlan(profile?.plan, 'pro')) {
    return NextResponse.json({ error: 'plan_required' }, { status: 403 })
  }
  if (!profile?.stripe_subscription_id) {
    return NextResponse.json({ error: 'no_subscription' }, { status: 400 })
  }

  const stripe = getStripeClient()

  try {
    const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id)
    if (getAddonItem(subscription)) {
      return NextResponse.json({ error: 'already_active' }, { status: 400 })
    }

    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      items: [{ price: addonPriceId }],
      proration_behavior: 'create_prorations',
    })

    const serviceSupabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    await serviceSupabase.from('profiles').update({ ai_addon_active: true }).eq('id', user.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[iplanit] Error activating AI add-on:', err)
    return NextResponse.json({ error: 'activation_failed' }, { status: 500 })
  }
}
