import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getStripeClient } from '@/lib/stripe'

// Read-only, live from Stripe rather than a synced DB column - trial_end
// and status are purely informational (Settings' "your trial ends on X"
// note), so fetching on demand avoids adding another field that could ever
// drift out of sync with the actual subscription, the way profiles.plan
// has to be kept in sync carefully via the webhook for actual access
// control. This one doesn't gate anything, so it doesn't need that.
export async function GET() {
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
    return NextResponse.json({ subscription: null })
  }

  try {
    const subscription = await getStripeClient().subscriptions.retrieve(profile.stripe_subscription_id)
    const item = subscription.items.data[0]

    return NextResponse.json({
      subscription: {
        status: subscription.status,
        trialEnd: subscription.trial_end,
        currency: subscription.currency,
        priceAmount: item?.price.unit_amount ?? null,
      },
    })
  } catch (err) {
    console.error('[iplanit] Error retrieving subscription status:', err)
    return NextResponse.json({ error: 'retrieve_failed' }, { status: 500 })
  }
}
