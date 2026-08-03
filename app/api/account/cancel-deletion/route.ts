import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

// Reverses /api/account/delete - clears the marker so the purge cron
// (app/api/cron/purge-deleted-accounts) never picks this account up.
export async function POST() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const serviceClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await serviceClient
    .from('profiles')
    .update({ deletion_requested_at: null })
    .eq('id', user.id)

  if (error) {
    console.error('[iplanit] Error cancelling account deletion:', error)
    return NextResponse.json({ error: 'cancel_failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
