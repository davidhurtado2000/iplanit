import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

// Only marks the account for deletion - doesn't delete anything yet. The
// actual destructive work (notifying clients, cancelling Stripe, calling
// auth.admin.deleteUser) happens 30 days later in
// app/api/cron/purge-deleted-accounts, giving a window to cancel via
// /api/account/cancel-deletion. profiles.deletion_requested_at is
// service_role-only to write (scripts/051), so this has to go through an
// API route rather than a direct client update.
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
    .update({ deletion_requested_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) {
    console.error('[iplanit] Error requesting account deletion:', error)
    return NextResponse.json({ error: 'request_failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
