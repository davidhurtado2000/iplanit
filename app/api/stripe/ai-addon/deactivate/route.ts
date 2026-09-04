import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getStripeClient, getAddonItem } from '@/lib/stripe'
import type { Database } from '@/lib/supabase/types'

// Removes only the AI add-on item from the subscription - the base plan
// item is untouched, so this never affects Pro/Premium access. The add-on
// item id is looked up fresh from Stripe each time rather than stored, so
// there's nothing that can go stale.
//
// Billing stops right away (the item is gone, no more charges), but access
// itself continues until the period already paid for actually ends - same
// as cancelling any other subscription (Netflix, Spotify, ...), not an
// immediate cutoff. proration_behavior: 'none' means no credit either: the
// user gets to use the remaining days instead of getting money back for
// them, so there's nothing left to prorate. See lib/ai-usage-client.ts's
// isAiAddonActive() for how ai_addon_access_until is actually enforced.
export async function POST() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
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
    const addonItem = getAddonItem(subscription)
    if (!addonItem) {
      return NextResponse.json({ error: 'not_active' }, { status: 400 })
    }

    // The item's own current_period_end (not the subscription's - Stripe
    // moved billing periods to the item level) is exactly the date this
    // specific add-on charge already covers through.
    const accessUntil = new Date(addonItem.current_period_end * 1000).toISOString()

    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      items: [{ id: addonItem.id, deleted: true }],
      proration_behavior: 'none',
    })

    const serviceSupabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    await serviceSupabase
      .from('profiles')
      .update({ ai_addon_active: false, ai_addon_access_until: accessUntil })
      .eq('id', user.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[iplanit] Error deactivating AI add-on:', err)
    return NextResponse.json({ error: 'deactivation_failed' }, { status: 500 })
  }
}
