import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createPushAdminClient, pushConfigured, sendPushToUsers } from '@/lib/push/send'

// "Probar": sends a test notice to the caller's OWN devices only.

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  if (!pushConfigured()) return NextResponse.json({ error: 'push_not_configured' }, { status: 503 })

  const body = await request.json().catch(() => null)
  const english = body?.language === 'en'
  const result = await sendPushToUsers(createPushAdminClient(), [user.id], {
    title: 'iPlanit',
    body: english ? 'Notifications work on this device ✅' : 'Los avisos funcionan en este dispositivo ✅',
    url: '/dashboard',
    tag: 'iplanit-test',
  })
  return NextResponse.json(result)
}
