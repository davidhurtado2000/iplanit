import { createClient } from '@/lib/supabase/client'

// Kept in sync by hand with the thresholds hardcoded in
// scripts/052-three-tier-plans.sql (Postgres can't import this constant) -
// change both together if these numbers ever move.
export const FREE_LIMITS = {
  reservationsPerMonth: 50,
  clients: 20,
  services: 3,
  resources: 2,
}

// Pro has no cap on reservations/clients (see limitFor below) - only
// services, resources and team seats stay capped, higher than Free.
export const PRO_LIMITS = {
  services: 5,
  resources: 5,
  teamSeats: 2,
}

export type PlanTier = 'free' | 'pro' | 'premium'
export type PlanUsageKind = 'reservations_this_month' | 'clients' | 'services' | 'resources'

interface PlanUsage {
  plan: PlanTier
  reservations_this_month: number
  clients: number
  services: number
  resources: number
  team_seats: number
}

const TIER_RANK: Record<PlanTier, number> = { free: 0, pro: 1, premium: 2 }

// Rank comparison instead of an equality check, so "requires Pro" also
// passes for Premium accounts without needing a separate branch anywhere
// that gates a feature.
export function meetsPlan(plan: string | null | undefined, required: 'pro' | 'premium'): boolean {
  const rank = TIER_RANK[(plan as PlanTier) ?? 'free'] ?? 0
  return rank >= TIER_RANK[required]
}

function limitFor(plan: PlanTier, kind: PlanUsageKind): number | null {
  if (kind === 'reservations_this_month') return plan === 'free' ? FREE_LIMITS.reservationsPerMonth : null
  if (kind === 'clients') return plan === 'free' ? FREE_LIMITS.clients : null
  if (plan === 'premium') return null
  return plan === 'pro' ? PRO_LIMITS[kind] : FREE_LIMITS[kind]
}

/**
 * Fresh, on-demand check (not cached) so it's always accurate right before
 * opening a "create" form - the actual guarantee against going over the
 * limit is the database trigger (see scripts/052-three-tier-plans.sql),
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
