import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getStripeClient, getAddonItem } from '@/lib/stripe'
import type { Database } from '@/lib/supabase/types'

// Removes only the AI add-on item from the subscription - the base plan
// item is untouched, so this never affects Pro/Premium access. The add-on
// item id is looked up fresh from Stripe each time rather than stored, so
// there's nothing that can go stale.
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

    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      items: [{ id: addonItem.id, deleted: true }],
    })

    const serviceSupabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    await serviceSupabase.from('profiles').update({ ai_addon_active: false }).eq('id', user.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[iplanit] Error deactivating AI add-on:', err)
    return NextResponse.json({ error: 'deactivation_failed' }, { status: 500 })
  }
}
