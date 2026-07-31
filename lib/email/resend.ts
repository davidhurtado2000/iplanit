import { Resend } from 'resend'

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
