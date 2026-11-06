import crypto from 'crypto'

// AES-256-GCM for secrets stored in the database (Kommo tokens, invoicing
// provider tokens). A random 12-byte IV per call plus a 16-byte auth tag, so
// tampering with the stored value is detected on decrypt instead of silently
// returning garbage.
//
// Each feature uses its own key, named by env var, so rotating one never
// breaks the other. Keys are 32 bytes, hex-encoded (64 hex chars):
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// Losing or rotating a key makes every value stored with it unreadable.
function getKey(envVar: string): Buffer {
  const hex = process.env[envVar]
  if (!hex) throw new Error(`${envVar} is not set`)
  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) throw new Error(`${envVar} must be 32 bytes (64 hex chars)`)
  return key
}

// Stored as "iv:authTag:ciphertext", each part hex-encoded, in one text column.
export function encryptSecret(plainText: string, keyEnvVar: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(keyEnvVar), iv)
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptSecret(stored: string, keyEnvVar: string): string {
  const [ivHex, authTagHex, dataHex] = stored.split(':')
  if (!ivHex || !authTagHex || !dataHex) throw new Error('Malformed encrypted value')
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(keyEnvVar), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()])
  return decrypted.toString('utf8')
}
