// Server-only - tokens here have no NEXT_PUBLIC_ prefix on purpose, so
// bundlers never ship them to the browser. Only import this file from API
// routes / server code.
//
// Every call takes an explicit KommoConfig instead of reading env vars
// internally - phase 1 (getEnvKommoConfig, one shared test account) and
// phase 2 (getBusinessKommoConfig, one OAuth-connected account per
// business, see app/api/integrations/kommo/callback) both produce one, so
// findOrCreateContact/createLead work unchanged regardless of which phase
// is calling them.
export interface KommoConfig {
  subdomain: string
  accessToken: string
  /** Custom-field/enum ids for this ACCOUNT's own PHONE/EMAIL contact
   * fields - auto-generated per Kommo account, never universal constants.
   * Phase 1's are hardcoded below (read once via GET /contacts/custom_fields
   * for that one test account); phase 2 discovers and caches its own per
   * business at connect time (discoverContactFieldIds below). */
  phoneFieldId: number
  phoneEnumId: number
  emailFieldId: number
  emailEnumId: number
}

/** Phase 1 - the single shared test account's config, read from env. */
export function getEnvKommoConfig(): KommoConfig {
  const subdomain = process.env.KOMMO_SUBDOMAIN
  const accessToken = process.env.KOMMO_ACCESS_TOKEN
  if (!subdomain || !accessToken) throw new Error('KOMMO_SUBDOMAIN or KOMMO_ACCESS_TOKEN is not set')
  return {
    subdomain,
    accessToken,
    phoneFieldId: 41876,
    phoneEnumId: 32566,
    emailFieldId: 41878,
    emailEnumId: 32576,
  }
}

async function kommoFetch(config: Pick<KommoConfig, 'subdomain' | 'accessToken'>, path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`https://${config.subdomain}/api/v4${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.accessToken}`,
      ...(init?.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Kommo API ${path} failed: ${res.status} ${body}`)
  }
  if (res.status === 204) return null
  return res.json()
}

// Looks up THIS account's own field/enum ids for the built-in PHONE/EMAIL
// contact fields - called once per business at OAuth-connect time (see the
// callback route) and cached in kommo_integrations, since every account
// has different auto-generated ids for the same built-in fields. The enum
// VALUES ("MOB", "PRIV") are Kommo's own out-of-the-box defaults and are
// assumed stable across accounts; only their numeric ids vary.
export async function discoverContactFieldIds(
  config: Pick<KommoConfig, 'subdomain' | 'accessToken'>
): Promise<{ phoneFieldId: number; phoneEnumId: number; emailFieldId: number; emailEnumId: number } | null> {
  const data = await kommoFetch(config, '/contacts/custom_fields')
  const fields = data?._embedded?.custom_fields as
    | { id: number; code: string; enums: { id: number; value: string }[] | null }[]
    | undefined
  if (!fields) return null

  const phoneField = fields.find((f) => f.code === 'PHONE')
  const emailField = fields.find((f) => f.code === 'EMAIL')
  const phoneEnum = phoneField?.enums?.find((e) => e.value === 'MOB')
  const emailEnum = emailField?.enums?.find((e) => e.value === 'PRIV')

  if (!phoneField || !emailField || !phoneEnum || !emailEnum) return null

  return {
    phoneFieldId: phoneField.id,
    phoneEnumId: phoneEnum.id,
    emailFieldId: emailField.id,
    emailEnumId: emailEnum.id,
  }
}

export interface KommoContactInput {
  name: string
  phone?: string | null
  email?: string | null
}

// Finds an existing contact by phone or email (Kommo's own search covers
// both), or creates a new one - mirrors the same "match by phone/email"
// dedupe iPlanit already does internally for its own clients (see
// normalize_phone_for_matching, scripts/044), so the same person doesn't
// get a duplicate Kommo contact on their second reservation.
export async function findOrCreateContact(config: KommoConfig, input: KommoContactInput): Promise<number> {
  const query = input.phone || input.email
  if (query) {
    const found = await kommoFetch(config, `/contacts?query=${encodeURIComponent(query)}&limit=1`)
    const existingId = found?._embedded?.contacts?.[0]?.id
    if (existingId) return existingId
  }

  const custom_fields_values: any[] = []
  if (input.phone) {
    custom_fields_values.push({
      field_id: config.phoneFieldId,
      values: [{ value: input.phone, enum_id: config.phoneEnumId }],
    })
  }
  if (input.email) {
    custom_fields_values.push({
      field_id: config.emailFieldId,
      values: [{ value: input.email, enum_id: config.emailEnumId }],
    })
  }

  const created = await kommoFetch(config, '/contacts', {
    method: 'POST',
    body: JSON.stringify([{ name: input.name, custom_fields_values }]),
  })
  const id = created?._embedded?.contacts?.[0]?.id
  if (!id) throw new Error('Kommo did not return a contact id')
  return id
}

export interface KommoLeadInput {
  name: string
  /** Whole-currency-unit price (Kommo's `price` field takes an integer, no decimals). */
  price?: number | null
  contactId: number
}

// No pipeline/status passed - omitting both lands the lead in the
// account's default pipeline and its first ("incoming") status
// automatically, which is enough to prove the mechanics work. Mapping
// reservation status -> a specific pipeline stage is a deliberate later
// step (needs the business to tell us which stage means what), not part
// of this proof of concept.
export async function createLead(config: KommoConfig, input: KommoLeadInput): Promise<number> {
  const created = await kommoFetch(config, '/leads', {
    method: 'POST',
    body: JSON.stringify([
      {
        name: input.name,
        price: input.price ? Math.round(input.price) : undefined,
        _embedded: { contacts: [{ id: input.contactId }] },
      },
    ]),
  })
  const id = created?._embedded?.leads?.[0]?.id
  if (!id) throw new Error('Kommo did not return a lead id')
  return id
}

// ---- Phase 2: per-business (OAuth-connected) config ----
//
// Kept in this file rather than a separate module so getEnvKommoConfig and
// getBusinessKommoConfig are obviously two ways of producing the exact same
// KommoConfig shape everything above already consumes.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { encryptToken, decryptToken } from './encryption'

const REFRESH_MARGIN_MS = 5 * 60 * 1000 // refresh if expiring within 5 minutes, not just on a bare 401

function callbackRedirectUri(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.iplanit.io'}/api/integrations/kommo/callback`
}

async function refreshBusinessToken(
  supabase: SupabaseClient<Database>,
  businessId: string,
  subdomain: string,
  refreshTokenEncrypted: string
): Promise<{ accessToken: string } | null> {
  try {
    const res = await fetch(`https://${subdomain}/oauth2/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.KOMMO_CLIENT_ID,
        client_secret: process.env.KOMMO_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: decryptToken(refreshTokenEncrypted),
        redirect_uri: callbackRedirectUri(),
      }),
    })
    if (!res.ok) throw new Error(`refresh failed with ${res.status}`)

    const data = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number }
    await supabase
      .from('kommo_integrations')
      .update({
        access_token_encrypted: encryptToken(data.access_token),
        refresh_token_encrypted: encryptToken(data.refresh_token),
        token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
        status: 'active',
        last_error: null,
      })
      .eq('business_id', businessId)

    return { accessToken: data.access_token }
  } catch (err) {
    // Most likely cause: the refresh token itself expired (3 months of no
    // use, per Kommo's docs) - the business has to reconnect from Settings,
    // no way to recover from here. Marked 'error' so the Settings UI can
    // show that instead of silently doing nothing on every reservation.
    await supabase
      .from('kommo_integrations')
      .update({ status: 'error', last_error: err instanceof Error ? err.message : 'refresh_failed' })
      .eq('business_id', businessId)
    return null
  }
}

/** Phase 2 - returns null when the business has no active Kommo
 * integration (never connected, disconnected, or its refresh token has
 * expired and needs reconnecting) - every caller (sync-reservation, the
 * webhook) treats that as "nothing to do", not an error. */
export async function getBusinessKommoConfig(
  supabase: SupabaseClient<Database>,
  businessId: string
): Promise<KommoConfig | null> {
  const { data: integration } = await supabase
    .from('kommo_integrations')
    .select('*')
    .eq('business_id', businessId)
    .eq('status', 'active')
    .single()

  if (!integration) return null
  if (!integration.phone_field_id || !integration.phone_enum_id || !integration.email_field_id || !integration.email_enum_id) {
    return null
  }

  const expiresAt = new Date(integration.token_expires_at).getTime()
  const needsRefresh = expiresAt - Date.now() < REFRESH_MARGIN_MS

  const accessToken = needsRefresh
    ? (await refreshBusinessToken(supabase, businessId, integration.subdomain, integration.refresh_token_encrypted))?.accessToken
    : decryptToken(integration.access_token_encrypted)

  if (!accessToken) return null

  return {
    subdomain: integration.subdomain,
    accessToken,
    phoneFieldId: Number(integration.phone_field_id),
    phoneEnumId: Number(integration.phone_enum_id),
    emailFieldId: Number(integration.email_field_id),
    emailEnumId: Number(integration.email_enum_id),
  }
}
