import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getAiUsageThisMonth, AI_USAGE_MONTHLY_LIMIT } from '@/lib/ai-usage'
import type { Database } from '@/lib/supabase/types'

// Read-only usage count for the Settings -> Plan "Asistente de IA" card
// (components rendering the bar/warning need this on mount, not just when
// a request happens to fail with 429).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get('businessId')

  if (!businessId) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  // RLS is the access boundary - same pattern as the other dashboard routes.
  const { data: business } = await supabase.from('businesses').select('id').eq('id', businessId).single()
  if (!business) {
    return NextResponse.json({ error: 'business_not_found' }, { status: 404 })
  }

  const serviceSupabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const used = await getAiUsageThisMonth(serviceSupabase, businessId)

  return NextResponse.json({ used, limit: AI_USAGE_MONTHLY_LIMIT })
}
