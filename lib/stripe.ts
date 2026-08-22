import Stripe from 'stripe'

// Server-only - STRIPE_SECRET_KEY has no NEXT_PUBLIC_ prefix on purpose, so
// bundlers never ship it to the browser. Only import this file from API
// routes / server code.
let _client: Stripe | undefined

export function getStripeClient(): Stripe {
  if (!_client) {
    const apiKey = process.env.STRIPE_SECRET_KEY
    if (!apiKey) throw new Error('STRIPE_SECRET_KEY is not set')
    _client = new Stripe(apiKey)
  }
  return _client
}

// Shared between app/api/stripe/subscribe (new subscriptions) and
// app/api/stripe/change-plan (existing subscribers switching tiers) - one
// place for the tier -> Price ID lookup so both stay in sync.
export function getPriceIdForTier(tier: 'pro' | 'premium'): string | undefined {
  return tier === 'pro' ? process.env.STRIPE_PRICE_ID_PRO : process.env.STRIPE_PRICE_ID_PREMIUM
}
