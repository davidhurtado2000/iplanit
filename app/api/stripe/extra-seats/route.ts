import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getStripeClient, getExtraSeatPriceId, getSeatItem } from '@/lib/stripe'
import { meetsPlan, PREMIUM_LIMITS } from '@/lib/plan-limits'
import type { Database } from '@/lib/supabase/types'

// Sets Premium's extra-seat add-on to an ABSOLUTE target quantity (not
// increment/decrement) - the client already has the current count from
// planUsage.extra_seats_purchased, and "set to N" is race-safe against
// double-clicks the way "add 1" isn't. Same "second item on the existing
// subscription" pattern as the AI add-on, but quantity-based - the first
// quantity item in this codebase, since a Stripe item's quantity can't go
// below 1, so quantity 0 means deleting the item entirely.
//
// Per David's confirmed decision: any decrease gets an immediate prorated
// credit, same as an increase - standard seat-based SaaS billing (Slack/
// Notion-style). Unlike the AI add-on's binary on/off toggle (which
// deliberately withholds a refund on cancel), a seat count is a continuous
// quantity - going from 1 to 0 is the same kind of decrease as 3 to 2, not
// a "cancellation," so it gets the same prorated credit. This also means a
// same-day add-then-remove nets to roughly zero instead of losing money on
// the way down.
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const quantity = body?.quantity

  // Sanity ceiling, not a business limit - guards against a buggy/malicious
  // client creating a runaway real charge, since this directly drives a
  // Stripe subscription item quantity.
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 0 || quantity > 500) {
    return NextResponse.json({ error: 'invalid_quantity' }, { status: 400 })
  }

  const seatPriceId = getExtraSeatPriceId()
  if (!seatPriceId) {
    console.error('[iplanit] STRIPE_PRICE_ID_EXTRA_SEAT is not set')
    return NextResponse.json({ error: 'not_configured' }, { status: 500 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, stripe_subscription_id')
    .eq('id', user.id)
    .single()

  // Defense in depth - the Settings UI already only offers this to Premium
  // owners, but the route itself must not trust that, since a successful
  // call here creates a real recurring charge.
  if (!meetsPlan(profile?.plan, 'premium')) {
    return NextResponse.json({ error: 'plan_required' }, { status: 403 })
  }
  if (!profile?.stripe_subscription_id) {
    return NextResponse.json({ error: 'no_subscription' }, { status: 400 })
  }

  const stripe = getStripeClient()

  try {
    const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id)
    const seatItem = getSeatItem(subscription)
    const currentQuantity = seatItem?.quantity ?? 0

    if (quantity === currentQuantity) {
      return NextResponse.json({ error: 'already_current' }, { status: 400 })
    }

    // Closes a real exploit: without this, someone could buy a seat, invite
    // a 6th team member, then immediately shrink back down - the invited
    // member keeps their access regardless (add_business_staff only blocks
    // NEW invites once over cap, it never revokes existing ones), so the
    // seat would effectively be free. Same pattern every seat-based SaaS
    // uses (Slack, Notion, ...): you must free a seat by removing someone
    // before you can shrink your paid count below your active headcount.
    if (quantity < currentQuantity) {
      const { data: ownedBusiness } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', user.id)
        .limit(1)
        .single()

      if (ownedBusiness) {
        const { data: usageData } = await supabase.rpc('get_plan_usage', { p_business_id: ownedBusiness.id })
        const usage =
          usageData && typeof usageData === 'object' && !('error' in usageData)
            ? (usageData as unknown as { team_seats: number })
            : null
        const activeMemberCount = usage?.team_seats ?? 0
        const newCap = PREMIUM_LIMITS.includedSeats + quantity

        if (activeMemberCount > newCap) {
          return NextResponse.json({ error: 'members_exceed_new_cap', activeMemberCount }, { status: 400 })
        }
      }
    }

    if (quantity === 0 && seatItem) {
      // Full removal - item quantity can't go to 0 in Stripe, so this
      // deletes the item instead. Still prorates a credit, same as any
      // other decrease (see comment above) - this is not modeled as a
      // "cancellation."
      await stripe.subscriptions.update(profile.stripe_subscription_id, {
        items: [{ id: seatItem.id, deleted: true }],
        proration_behavior: 'create_prorations',
      })
    } else if (!seatItem) {
      await stripe.subscriptions.update(profile.stripe_subscription_id, {
        items: [{ price: seatPriceId, quantity }],
        proration_behavior: 'create_prorations',
      })
    } else {
      await stripe.subscriptions.update(profile.stripe_subscription_id, {
        items: [{ id: seatItem.id, quantity }],
        proration_behavior: 'create_prorations',
      })
    }

    const serviceSupabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    // Optimistic write, same pattern as the AI add-on - the Stripe webhook
    // (customer.subscription.updated) confirms it independently afterward.
    await serviceSupabase.from('profiles').update({ extra_seats_purchased: quantity }).eq('id', user.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[iplanit] Error updating extra seats:', err)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }
}
