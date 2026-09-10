import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyState } from '@/lib/kommo/oauth-state'
import { encryptToken } from '@/lib/kommo/encryption'
import { discoverContactFieldIds } from '@/lib/kommo/client'
import type { Database } from '@/lib/supabase/types'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.iplanit.io'
const SETTINGS_URL = `${APP_URL}/dashboard/settings?tab=integrations`

function redirectSettings(status: 'connected' | 'error') {
  return NextResponse.redirect(`${SETTINGS_URL}&kommo=${status}`)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  // User declined on Kommo's own consent screen - not an error, just
  // nothing to do.
  if (searchParams.get('error') === 'access_denied') {
    return redirectSettings('error')
  }

  const code = searchParams.get('code')
  const referer = searchParams.get('referer') // e.g. "example.kommo.com" - which account authorized
  const state = searchParams.get('state')

  if (!code || !referer || !state) {
    return redirectSettings('error')
  }

  const businessId = verifyState(state)
  if (!businessId) {
    console.error('[iplanit] Kommo OAuth callback: invalid or expired state')
    return redirectSettings('error')
  }

  try {
    const tokenRes = await fetch(`https://${referer}/oauth2/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.KOMMO_CLIENT_ID,
        client_secret: process.env.KOMMO_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${APP_URL}/api/integrations/kommo/callback`,
      }),
    })

    if (!tokenRes.ok) {
      const body = await tokenRes.text().catch(() => '')
      console.error('[iplanit] Kommo token exchange failed:', tokenRes.status, body)
      return redirectSettings('error')
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string
      refresh_token: string
      expires_in: number
    }

    // Token response doesn't include the account's own id - a follow-up
    // call is how phase 1's client.ts already reads account info, reused
    // here to get the id the webhook will later need to identify this
    // business from an incoming event (see app/api/integrations/kommo/webhook).
    const accountRes = await fetch(`https://${referer}/api/v4/account`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    if (!accountRes.ok) {
      console.error('[iplanit] Kommo account lookup failed after token exchange:', accountRes.status)
      return redirectSettings('error')
    }
    const account = (await accountRes.json()) as { id: number }

    // This account's own field/enum ids for PHONE/EMAIL - auto-generated
    // per Kommo account, so this can't be hardcoded the way phase 1's
    // single test account was. Without these, findOrCreateContact has no
    // way to attach a phone/email to a new contact for this business.
    const fieldIds = await discoverContactFieldIds({ subdomain: referer, accessToken: tokenData.access_token })
    if (!fieldIds) {
      console.error('[iplanit] Kommo callback: could not discover PHONE/EMAIL custom field ids for', referer)
      return redirectSettings('error')
    }

    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error } = await supabase.from('kommo_integrations').upsert(
      {
        business_id: businessId,
        subdomain: referer,
        kommo_account_id: String(account.id),
        access_token_encrypted: encryptToken(tokenData.access_token),
        refresh_token_encrypted: encryptToken(tokenData.refresh_token),
        token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
        phone_field_id: String(fieldIds.phoneFieldId),
        phone_enum_id: String(fieldIds.phoneEnumId),
        email_field_id: String(fieldIds.emailFieldId),
        email_enum_id: String(fieldIds.emailEnumId),
        status: 'active',
        last_error: null,
      },
      { onConflict: 'business_id' }
    )

    if (error) {
      console.error('[iplanit] Error saving Kommo integration:', error)
      return redirectSettings('error')
    }

    return redirectSettings('connected')
  } catch (err) {
    console.error('[iplanit] Error in Kommo OAuth callback:', err)
    return redirectSettings('error')
  }
}
