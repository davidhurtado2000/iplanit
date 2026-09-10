import crypto from 'crypto'

// Encrypts Kommo access/refresh tokens before they touch the database -
// unlike phase 1's single test token (only ever lived in .env.local, never
// in a table), phase 2 stores one token pair per BUSINESS in
// kommo_integrations, readable by anyone with database access (support,
// a backup, a future bug). AES-256-GCM: a random 12-byte IV per call (never
// reused with the same key) plus a 16-byte auth tag, so tampering with the
// stored value is detected on decrypt instead of silently returning
// garbage.
//
// KOMMO_TOKEN_ENCRYPTION_KEY is a 32-byte key, hex-encoded (64 hex chars) -
// generated once with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
// Losing/rotating this key makes every already-stored token unreadable -
// businesses would need to reconnect Kommo.
function getKey(): Buffer {
  const hex = process.env.KOMMO_TOKEN_ENCRYPTION_KEY
  if (!hex) throw new Error('KOMMO_TOKEN_ENCRYPTION_KEY is not set')
  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) throw new Error('KOMMO_TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars)')
  return key
}

// Stored as "iv:authTag:ciphertext", each part hex-encoded, in one text
// column - simpler than three separate columns for a value that's always
// read/written together.
export function encryptToken(plainText: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptToken(stored: string): string {
  const [ivHex, authTagHex, dataHex] = stored.split(':')
  if (!ivHex || !authTagHex || !dataHex) throw new Error('Malformed encrypted token')
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()])
  return decrypted.toString('utf8')
}
