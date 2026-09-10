// Server-only - KOMMO_ACCESS_TOKEN has no NEXT_PUBLIC_ prefix on purpose, so
// bundlers never ship it to the browser. Only import this file from API
// routes / server code.
//
// Proof-of-concept phase: one shared Kommo account, credentials read
// straight from env (KOMMO_SUBDOMAIN + KOMMO_ACCESS_TOKEN, generated as a
// long-lived token in Kommo's own UI - no OAuth flow yet). The eventual
// per-business version (each business connects its own Kommo account via
// OAuth, tokens stored encrypted in Supabase, auto-refreshed) is a
// different phase - see the "kommo integration" project memory for that
// plan. Swapping the token source later means changing getKommoConfig()
// below to take a business_id and look up its row instead of reading env
// vars; findOrCreateContact/createLead don't need to change at all.
//
// Field/pipeline IDs below (custom fields, default pipeline) are specific
// to THIS Kommo account - they were read once via GET /contacts/custom_fields
// and GET /leads/pipelines, not guessed. A different Kommo account (e.g. a
// real customer's, once this goes multi-tenant) will have different IDs and
// needs its own lookup, not these hardcoded values reused blindly.
const PHONE_FIELD_ID = 41876
const PHONE_ENUM_MOBILE = 32566
const EMAIL_FIELD_ID = 41878
const EMAIL_ENUM_PRIVATE = 32576

function getKommoConfig() {
  const subdomain = process.env.KOMMO_SUBDOMAIN
  const token = process.env.KOMMO_ACCESS_TOKEN
  if (!subdomain || !token) throw new Error('KOMMO_SUBDOMAIN or KOMMO_ACCESS_TOKEN is not set')
  return { baseUrl: `https://${subdomain}/api/v4`, token }
}

async function kommoFetch(path: string, init?: RequestInit): Promise<any> {
  const { baseUrl, token } = getKommoConfig()
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
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
export async function findOrCreateContact(input: KommoContactInput): Promise<number> {
  const query = input.phone || input.email
  if (query) {
    const found = await kommoFetch(`/contacts?query=${encodeURIComponent(query)}&limit=1`)
    const existingId = found?._embedded?.contacts?.[0]?.id
    if (existingId) return existingId
  }

  const custom_fields_values: any[] = []
  if (input.phone) {
    custom_fields_values.push({
      field_id: PHONE_FIELD_ID,
      values: [{ value: input.phone, enum_id: PHONE_ENUM_MOBILE }],
    })
  }
  if (input.email) {
    custom_fields_values.push({
      field_id: EMAIL_FIELD_ID,
      values: [{ value: input.email, enum_id: EMAIL_ENUM_PRIVATE }],
    })
  }

  const created = await kommoFetch('/contacts', {
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
export async function createLead(input: KommoLeadInput): Promise<number> {
  const created = await kommoFetch('/leads', {
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
