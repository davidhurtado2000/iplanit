import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

// Marks the integration disconnected rather than deleting the row - keeps
// last_synced_at/last_error around for support/debugging, same reasoning
// reservation_series (scripts/020) already uses for its own 'cancelled'
// status instead of a hard delete.
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const businessId = body?.businessId as string | undefined
  if (!businessId) {
    return NextResponse.json({ error: 'missing_business_id' }, { status: 400 })
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', businessId)
    .eq('owner_id', user.id)
    .single()

  if (!business) {
    return NextResponse.json({ error: 'business_not_found' }, { status: 404 })
  }

  const serviceSupabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await serviceSupabase
    .from('kommo_integrations')
    .update({ status: 'disconnected' })
    .eq('business_id', businessId)

  if (error) {
    return NextResponse.json({ error: 'disconnect_failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
