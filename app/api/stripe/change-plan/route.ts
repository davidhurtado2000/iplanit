import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getStripeClient, getPriceIdForTier, getPlanItem, getSeatItem } from '@/lib/stripe'
import type { Database } from '@/lib/supabase/types'

// Switches an EXISTING subscriber (already has an active subscription)
// between Pro and Premium by updating the price on their current
// subscription, instead of creating a second one - app/api/stripe/subscribe
// always creates a brand-new subscription and would leave the customer
// paying for two plans at once (see its already_subscribed guard). Stripe
// prorates the difference automatically.
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
    // Finds the plan item specifically (not items.data[0]) - the AI add-on
    // may already be a second item on this same subscription, and Stripe
    // doesn't guarantee array order.
    const item = getPlanItem(subscription)

    if (!item) {
      console.error('[iplanit] change-plan: subscription has no recognized plan item', {
        subscriptionId: profile.stripe_subscription_id,
      })
      return NextResponse.json({ error: 'change_failed' }, { status: 500 })
    }

    if (item.price.id === newPriceId) {
      return NextResponse.json({ error: 'already_on_plan' }, { status: 400 })
    }

    // Pro doesn't support extra seats at all (its 2-seat cap has no
    // purchase path) - downgrading from Premium must drop the seat item
    // too, in the SAME update call so its removal is prorated together
    // with the plan change, not left behind as an invisible charge. The
    // Settings UI only ever renders the seat stepper for plan === 'premium',
    // so without this a downgraded customer would keep paying for seats
    // with no way to even see, let alone cancel, that line item.
    const items: { id: string; price?: string; deleted?: true }[] = [{ id: item.id, price: newPriceId }]
    const seatItem = tier === 'pro' ? getSeatItem(subscription) : undefined
    if (seatItem) {
      items.push({ id: seatItem.id, deleted: true })
    }

    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      items,
      proration_behavior: 'create_prorations',
    })

    if (seatItem) {
      const serviceSupabase = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      // Optimistic write, same pattern as extra-seats/activate - the
      // webhook confirms it independently afterward.
      await serviceSupabase.from('profiles').update({ extra_seats_purchased: 0 }).eq('id', user.id)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[iplanit] Error changing Stripe subscription plan:', err)
    return NextResponse.json({ error: 'change_failed' }, { status: 500 })
  }
}
