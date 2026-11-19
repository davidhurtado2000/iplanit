import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createPushAdminClient } from '@/lib/push/send'
import { isAllowedPushEndpoint } from '@/lib/push/endpoint'

// A device turning the phone notices on (POST) or off (DELETE). The caller must
// be signed in; the row is always saved for THAT user, whatever the body says.

export const runtime = 'nodejs'

// Generous for one person's phones and computers; stops an account from
// filling the table.
const MAX_DEVICES_PER_USER = 20

async function currentUserId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function POST(request: Request) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const endpoint = body?.endpoint
  const p256dh = body?.keys?.p256dh
  const auth = body?.keys?.auth
  if (
    !isAllowedPushEndpoint(endpoint) ||
    typeof p256dh !== 'string' ||
    typeof auth !== 'string' ||
    !p256dh ||
    !auth
  ) {
    return NextResponse.json({ error: 'invalid_subscription' }, { status: 400 })
  }

  const admin = createPushAdminClient()
  const { count } = await admin
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  if ((count ?? 0) >= MAX_DEVICES_PER_USER) {
    const { data: existing } = await admin.from('push_subscriptions').select('id').eq('endpoint', endpoint).eq('user_id', userId).maybeSingle()
    if (!existing) return NextResponse.json({ error: 'too_many_devices' }, { status: 429 })
  }
  // Same device, different person signing in on it: the endpoint moves to
  // the new user instead of staying with the old one.
  const { error } = await admin.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint,
      p256dh,
      auth,
      user_agent: (request.headers.get('user-agent') ?? '').slice(0, 300),
    },
    { onConflict: 'endpoint' }
  )
  if (error) {
    console.error('[iplanit] push subscribe failed:', error.message)
    return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (typeof body?.endpoint !== 'string') return NextResponse.json({ error: 'invalid_subscription' }, { status: 400 })

  const admin = createPushAdminClient()
  await admin.from('push_subscriptions').delete().eq('endpoint', body.endpoint).eq('user_id', userId)
  return NextResponse.json({ ok: true })
}
