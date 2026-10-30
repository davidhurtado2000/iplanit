import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getResendClient, NOTIFICATIONS_FROM_EMAIL } from '@/lib/email/resend'
import { buildWorkerInviteEmail } from '@/lib/email/templates'
import type { Database } from '@/lib/supabase/types'

// Sends the access email for a worker account (scripts/104). The recipient
// is never taken from the request - only the invite_email the owner/admin
// already set via invite_worker_access() - so this can't be used to send
// iPlanit-branded mail to arbitrary addresses.
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const workerId: string | undefined = body?.workerId
  const language = body?.language === 'en' ? 'en' : 'es'
  if (!workerId) {
    return NextResponse.json({ error: 'missing_worker' }, { status: 400 })
  }

  const service = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: worker } = await service
    .from('workers')
    .select('id, name, business_id, invite_email, user_id')
    .eq('id', workerId)
    .single()
  if (!worker?.invite_email) {
    return NextResponse.json({ error: 'no_invite' }, { status: 400 })
  }

  // Role check runs as the caller (auth.uid() inside the function).
  const { data: role } = await supabase.rpc('business_member_role', { target_business_id: worker.business_id })
  if (role !== 'owner' && role !== 'admin') {
    return NextResponse.json({ error: 'not_allowed' }, { status: 403 })
  }

  const { data: business } = await service
    .from('businesses')
    .select('name, email')
    .eq('id', worker.business_id)
    .single()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.iplanit.io'
  const alreadyHasAccount = !!worker.user_id
  const url = alreadyHasAccount
    ? `${appUrl}/login`
    : `${appUrl}/register?invite=staff&email=${encodeURIComponent(worker.invite_email)}`

  const { subject, html } = buildWorkerInviteEmail({
    workerName: worker.name,
    businessName: business?.name || 'iPlanit',
    url,
    alreadyHasAccount,
    language,
  })

  try {
    await getResendClient().emails.send({
      from: NOTIFICATIONS_FROM_EMAIL,
      to: worker.invite_email,
      replyTo: business?.email?.trim() || undefined,
      subject,
      html,
    })
  } catch (err) {
    console.error('[iplanit] Error sending worker invite email:', err)
    return NextResponse.json({ error: 'send_failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true, url })
}
