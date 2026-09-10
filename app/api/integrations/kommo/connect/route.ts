import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { signState } from '@/lib/kommo/oauth-state'

// Phase 2 - starts the OAuth flow for ONE business connecting its OWN
// Kommo account (as opposed to phase 1's single test account shared via
// env vars). Called from a "Conectar con Kommo" link/button in Settings,
// e.g. /api/integrations/kommo/connect?business_id=<id>.
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get('business_id')
  if (!businessId) {
    return NextResponse.json({ error: 'missing_business_id' }, { status: 400 })
  }

  // Belt and suspenders with the RLS policy on `businesses` - confirms
  // explicitly here so a wrong/foreign business_id fails with a clear 404
  // instead of silently returning no row and continuing anyway.
  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', businessId)
    .eq('owner_id', user.id)
    .single()

  if (!business) {
    return NextResponse.json({ error: 'business_not_found' }, { status: 404 })
  }

  const clientId = process.env.KOMMO_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'not_configured' }, { status: 500 })
  }

  const state = signState(businessId)
  const authorizeUrl = new URL('https://www.kommo.com/oauth')
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('mode', 'post_message')

  return NextResponse.redirect(authorizeUrl.toString())
}
