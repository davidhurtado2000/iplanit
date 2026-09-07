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

// The AI add-on's own recurring Price - a second item added to an existing
// plan subscription (see app/api/stripe/ai-addon/*), never its own
// subscription.
export function getAiAddonPriceId(): string | undefined {
  return process.env.STRIPE_PRICE_ID_AI_ADDON
}

// Which Stripe Price ID maps to which iPlanit plan tier - built once at
// module load. STRIPE_PRICE_ID_PREMIUM_LEGACY is the original $35 Price
// (pre-3-tier); kept here purely so existing subscribers on it still
// resolve to 'premium' - it's never used to create new checkouts.
const PRICE_TIER_MAP: Record<string, 'pro' | 'premium'> = {}
if (process.env.STRIPE_PRICE_ID_PRO) PRICE_TIER_MAP[process.env.STRIPE_PRICE_ID_PRO] = 'pro'
if (process.env.STRIPE_PRICE_ID_PREMIUM) PRICE_TIER_MAP[process.env.STRIPE_PRICE_ID_PREMIUM] = 'premium'
if (process.env.STRIPE_PRICE_ID_PREMIUM_LEGACY) PRICE_TIER_MAP[process.env.STRIPE_PRICE_ID_PREMIUM_LEGACY] = 'premium'

export function tierFromPriceId(priceId: string | undefined | null): 'pro' | 'premium' | null {
  if (!priceId) return null
  return PRICE_TIER_MAP[priceId] ?? null
}

// Finds the subscription item representing the base plan (Pro/Premium),
// ignoring any other item on the same subscription (e.g. the AI add-on).
// Stripe does not guarantee items.data ordering, so nothing may assume the
// plan is items.data[0] once a second item can exist.
export function getPlanItem(subscription: Stripe.Subscription): Stripe.SubscriptionItem | undefined {
  return subscription.items.data.find((item) => tierFromPriceId(item.price.id) !== null)
}

export function getAddonItem(subscription: Stripe.Subscription): Stripe.SubscriptionItem | undefined {
  const addonPriceId = getAiAddonPriceId()
  if (!addonPriceId) return undefined
  return subscription.items.data.find((item) => item.price.id === addonPriceId)
}

// Premium's extra-seat add-on - a quantity-based line item on the same
// subscription (see app/api/stripe/extra-seats), unlike the AI add-on's
// flat second item. quantity === number of EXTRA seats beyond Premium's 5
// included (scripts/080-premium-extra-seats.sql).
export function getExtraSeatPriceId(): string | undefined {
  return process.env.STRIPE_PRICE_ID_EXTRA_SEAT
}

export function getSeatItem(subscription: Stripe.Subscription): Stripe.SubscriptionItem | undefined {
  const seatPriceId = getExtraSeatPriceId()
  if (!seatPriceId) return undefined
  return subscription.items.data.find((item) => item.price.id === seatPriceId)
}
