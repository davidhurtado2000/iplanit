import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

// Shared between the analytics summary and chat routes - both draw from the
// same add-on quota (see scripts/077-ai-addon.sql: one ai_usage_log table,
// not two separate ones), so the counting/logging logic lives in one place
// instead of being duplicated per route.
//
// Calendar month (UTC), not each subscription's actual Stripe billing
// period - a deliberate simplification. Aligning to the real billing cycle
// would need each business's current_period_start plumbed through, for a
// difference that only ever matters by a few days near signup - not worth
// the extra complexity for a $7 add-on.
export const AI_USAGE_MONTHLY_LIMIT = 300
export const AI_USAGE_WARNING_THRESHOLD = 270

function startOfCurrentMonthUtc(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export function startOfNextMonthUtc(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
}

export async function getAiUsageThisMonth(
  supabase: SupabaseClient<Database>,
  businessId: string
): Promise<number> {
  const { count } = await supabase
    .from('ai_usage_log')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .gte('created_at', startOfCurrentMonthUtc().toISOString())
  return count ?? 0
}

export async function logAiUsage(
  supabase: SupabaseClient<Database>,
  businessId: string,
  type: 'summary' | 'chat'
): Promise<void> {
  await supabase.from('ai_usage_log').insert({ business_id: businessId, type })
}
