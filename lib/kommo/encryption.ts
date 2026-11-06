import { decryptSecret, encryptSecret } from '@/lib/crypto'

// Encrypts Kommo access/refresh tokens before they touch the database - one
// token pair per BUSINESS in kommo_integrations, readable by anyone with
// database access (support, a backup, a future bug). The AES-256-GCM logic
// lives in lib/crypto.ts, shared with electronic invoicing.
//
// Keeps its own key, KOMMO_TOKEN_ENCRYPTION_KEY (same format as before), so
// every token already stored keeps decrypting. Losing/rotating this key makes
// every stored token unreadable - businesses would need to reconnect Kommo.
const KEY_ENV = 'KOMMO_TOKEN_ENCRYPTION_KEY'

export function encryptToken(plainText: string): string {
  return encryptSecret(plainText, KEY_ENV)
}

export function decryptToken(stored: string): string {
  return decryptSecret(stored, KEY_ENV)
}
