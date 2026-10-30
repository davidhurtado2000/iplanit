import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

// Server-only - RESEND_API_KEY has no NEXT_PUBLIC_ prefix on purpose, so
// bundlers never ship it to the browser. Only import this file from API
// routes / server code.
let _client: Resend | undefined

export function getResendClient(): Resend {
  if (!_client) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) throw new Error('RESEND_API_KEY is not set')
    _client = new Resend(apiKey)
  }
  return _client
}

// Local-part is free to pick (Resend only requires the domain itself to be
// verified, not a real mailbox) - iplanit.io was verified in Resend on
// 2026-07-30, see scripts/041-email-notifications.sql for the DB side of
// this feature.
export const NOTIFICATIONS_FROM_EMAIL = 'iPlanit <reservas@iplanit.io>'

type ServiceClient = SupabaseClient<Database>

// iplanit.io has no MX record - it can send (via Resend) but can't receive,
// so a client hitting "reply" on a reminder used to bounce. Client-facing
// emails set Reply-To to the business's own email (businesses.email, from
// Settings) so replies land with the business, which is who actually needs
// to read "I'm running late". Businesses without an email set simply get no
// Reply-To, same behavior as before.
export async function getBusinessEmailsByReservation(
  supabase: ServiceClient,
  reservationIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (reservationIds.length === 0) return result
  const { data: reservations } = await supabase
    .from('reservations')
    .select('id, business_id')
    .in('id', [...new Set(reservationIds)])
  const byBusiness = await getBusinessEmailsById(
    supabase,
    (reservations || []).map((r) => r.business_id)
  )
  for (const r of reservations || []) {
    const email = byBusiness.get(r.business_id)
    if (email) result.set(r.id, email)
  }
  return result
}

export async function getBusinessEmailsById(
  supabase: ServiceClient,
  businessIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (businessIds.length === 0) return result
  const { data } = await supabase.from('businesses').select('id, email').in('id', [...new Set(businessIds)])
  for (const b of data || []) {
    if (b.email?.trim()) result.set(b.id, b.email.trim())
  }
  return result
}
