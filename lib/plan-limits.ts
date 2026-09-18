import { createClient } from '@/lib/supabase/client'

// Kept in sync by hand with the thresholds hardcoded in
// scripts/090-basic-tier-rename.sql (Postgres can't import this constant) -
// change both together if these numbers ever move.
//
// 'free' is no longer a sellable tier (see scripts/090) - it now means
// "frozen: no active paid subscription" (lapsed/cancelled, or a brand-new
// signup that hasn't picked a plan yet, until Phase 4's registration flow
// ships). A frozen account can see its existing data but create nothing
// new - every kind capped at 0, distinct from Basic's real limits below.
export const FROZEN_LIMITS = {
  reservationsPerMonth: 0,
  clients: 0,
  services: 0,
  resources: 0,
}

// Basic is the new floor paid tier ($15/mo) - clients/services are
// deliberately NOT capped here (David's call, inspired by Fresha: gate on
// resources, not on catalog size) - only reservations and resources cap.
export const BASIC_LIMITS = {
  reservationsPerMonth: 100,
  resources: 5,
}

// Pro has its own real reservation cap now too (not unlimited like the old
// 2-tier system) - only Premium is truly unlimited. Clients/services stay
// uncapped on Pro (see limitFor below).
export const PRO_LIMITS = {
  reservationsPerMonth: 500,
  resources: 10,
  teamSeats: 2,
}

// Premium is no longer unconditionally unlimited on seats - includes 5,
// shared org-wide across every sede an owner runs (see scripts/080-
// premium-extra-seats.sql), then $10/mo per extra seat purchased via
// app/api/stripe/extra-seats (a quantity-based line item on the same
// subscription, same pattern as the AI add-on's second item).
export const PREMIUM_LIMITS = {
  includedSeats: 5,
  extraSeatPriceUsd: 10,
}

export type PlanTier = 'free' | 'basic' | 'pro' | 'premium'
export type PlanUsageKind = 'reservations_this_month' | 'clients' | 'services' | 'resources'

interface PlanUsage {
  plan: PlanTier
  reservations_this_month: number
  clients: number
  services: number
  resources: number
  team_seats: number
}

// 'free' ranks below every real tier (including Basic) - a frozen account
// must never pass a meetsPlan() check the way an actual low tier would.
const TIER_RANK: Record<PlanTier, number> = { free: -1, basic: 0, pro: 1, premium: 2 }

// Rank comparison instead of an equality check, so "requires Pro" also
// passes for Premium accounts without needing a separate branch anywhere
// that gates a feature.
export function meetsPlan(plan: string | null | undefined, required: 'pro' | 'premium'): boolean {
  const rank = TIER_RANK[(plan as PlanTier) ?? 'free'] ?? -1
  return rank >= TIER_RANK[required]
}

function limitFor(plan: PlanTier, kind: PlanUsageKind): number | null {
  // Frozen - blocked from creating anything new, regardless of kind.
  if (plan === 'free') return 0
  if (plan === 'premium') return null
  // Clients/services are unlimited on every real (non-frozen) tier now.
  if (kind === 'clients' || kind === 'services') return null
  if (kind === 'reservations_this_month') return plan === 'pro' ? PRO_LIMITS.reservationsPerMonth : BASIC_LIMITS.reservationsPerMonth
  return plan === 'pro' ? PRO_LIMITS.resources : BASIC_LIMITS.resources
}

/**
 * Fresh, on-demand check (not cached) so it's always accurate right before
 * opening a "create" form - the actual guarantee against going over the
 * limit is the database trigger (see scripts/090-basic-tier-rename.sql),
 * this is only the proactive UX nicety that shows the Upgrade modal before
 * the user bothers filling out a form that would just get rejected.
 *
 * Tier-aware via the `plan` field get_plan_usage() now returns (the
 * business's actual plan, resolved through its owner) rather than trusting
 * the caller's own profile - correct even when the caller is a staff
 * member of someone else's Pro/Premium business, whose own profile.plan is
 * typically 'free'.
 */
export async function isPlanLimitReached(businessId: string, kind: PlanUsageKind): Promise<boolean> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_plan_usage', { p_business_id: businessId })
  if (error || !data || typeof data !== 'object' || 'error' in data) return false
  const usage = data as unknown as PlanUsage
  const limit = limitFor(usage.plan, kind)
  return limit !== null && usage[kind] >= limit
}
