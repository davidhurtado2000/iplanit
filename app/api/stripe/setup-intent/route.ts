import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getStripeClient } from '@/lib/stripe'
import type { Database } from '@/lib/supabase/types'

// Step 1 of the embedded checkout flow (replaces the old hosted-Checkout
// redirect): collects a card via a SetupIntent without charging anything,
// so app/api/stripe/subscribe/route.ts can inspect the card's fingerprint
// and decide trial eligibility BEFORE any subscription/charge is created -
// impossible with the old flow, where Stripe never told us the card until
// after the checkout had already completed.
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

  const stripe = getStripeClient()

  // profiles.stripe_customer_id is revoked from the 'authenticated' role
  // (scripts/049-stripe-billing.sql) - only service-role writes it, same as
  // the webhook already does for plan/subscription_id.
  const serviceSupabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const createFreshCustomer = async () => {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    })
    await serviceSupabase.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', user.id)
    return customer.id
  }

  // Lets the embedded PaymentElement show this customer's previously-saved
  // cards (e.g. after a cancel + resubscribe) instead of always rendering a
  // blank card form - the SetupIntent's own client secret only grants access
  // to create a NEW payment method, not to list existing ones.
  const createCustomerSession = async (customerId: string) => {
    const session = await stripe.customerSessions.create({
      customer: customerId,
      components: {
        payment_element: {
          enabled: true,
          features: {
            payment_method_redisplay: 'enabled',
            // Default is ['always'] only. Every card saved through this
            // flow exists for exactly one purpose - reusable subscription
            // billing - so there's no "unconsented one-off card" risk here;
            // without this, cards saved before this feature shipped (which
            // Stripe marked 'unspecified', not 'always') would stay hidden
            // even for the right customer in the right mode.
            payment_method_allow_redisplay_filters: ['always', 'limited', 'unspecified'],
            payment_method_save: 'enabled',
            payment_method_save_usage: 'off_session',
            payment_method_remove: 'enabled',
          },
        },
      },
    })
    return session.client_secret
  }

  try {
    let customerId = profile?.stripe_customer_id ?? null
    if (!customerId) {
      customerId = await createFreshCustomer()
    }

    try {
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        // Card will be charged later without the user present (trial
        // ending, monthly renewals) - same as any normal subscription
        // payment method.
        usage: 'off_session',
        payment_method_types: ['card'],
        // Explicit alongside payment_method_types (belt-and-suspenders) -
        // this plan is scoped to cards only (see the plan's scope
        // decision), automatic_payment_methods left on could otherwise let
        // Stripe surface bank/wallet options we never built confirmation UI
        // for.
        automatic_payment_methods: { enabled: false },
      })
      const customerSessionClientSecret = await createCustomerSession(customerId)
      return NextResponse.json({ clientSecret: setupIntent.client_secret, customerSessionClientSecret })
    } catch (err) {
      // A customer stored on our side can go stale if it's ever deleted
      // directly in the Stripe Dashboard (confirmed happening with test
      // data) - self-heal by minting a replacement instead of leaving the
      // user stuck on a generic error every time they try to subscribe.
      const isMissingCustomer =
        typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'resource_missing'
      if (!isMissingCustomer) throw err

      const freshCustomerId = await createFreshCustomer()
      const setupIntent = await stripe.setupIntents.create({
        customer: freshCustomerId,
        usage: 'off_session',
        payment_method_types: ['card'],
        automatic_payment_methods: { enabled: false },
      })
      const customerSessionClientSecret = await createCustomerSession(freshCustomerId)
      return NextResponse.json({ clientSecret: setupIntent.client_secret, customerSessionClientSecret })
    }
  } catch (err) {
    console.error('[iplanit] Error creating SetupIntent:', err)
    return NextResponse.json({ error: 'setup_intent_failed' }, { status: 500 })
  }
}
