import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getStripeClient } from '@/lib/stripe'

// Stripe's own hosted Billing Portal - lets a subscriber update their card,
// see invoices, or cancel without any custom UI on our side.
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
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: 'no_subscription' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://iplanit.io'
  const stripe = getStripeClient()

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${appUrl}/dashboard/settings`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[iplanit] Error creating Stripe billing portal session:', err)
    return NextResponse.json({ error: 'portal_failed' }, { status: 500 })
  }
}
