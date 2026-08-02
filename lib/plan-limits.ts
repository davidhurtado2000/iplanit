import { createClient } from '@/lib/supabase/client'

// Kept in sync by hand with the thresholds hardcoded in
// scripts/048-free-plan-limits.sql (Postgres can't import this constant) -
// change both together if these numbers ever move.
export const FREE_LIMITS = {
  reservationsPerMonth: 50,
  clients: 20,
  services: 3,
  resources: 2,
}

export type PlanUsageKind = 'reservations_this_month' | 'clients' | 'services' | 'resources'

interface PlanUsage {
  reservations_this_month: number
  clients: number
  services: number
  resources: number
}

const LIMIT_BY_KIND: Record<PlanUsageKind, number> = {
  reservations_this_month: FREE_LIMITS.reservationsPerMonth,
  clients: FREE_LIMITS.clients,
  services: FREE_LIMITS.services,
  resources: FREE_LIMITS.resources,
}

/**
 * Fresh, on-demand check (not cached) so it's always accurate right before
 * opening a "create" form - the actual guarantee against going over the
 * limit is the database trigger (see scripts/048-free-plan-limits.sql),
 * this is only the proactive UX nicety that shows the Upgrade modal before
 * the user bothers filling out a form that would just get rejected.
 */
export async function isPlanLimitReached(businessId: string, kind: PlanUsageKind): Promise<boolean> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_plan_usage', { p_business_id: businessId })
  if (error || !data || typeof data !== 'object' || 'error' in data) return false
  const usage = data as unknown as PlanUsage
  return usage[kind] >= LIMIT_BY_KIND[kind]
}
