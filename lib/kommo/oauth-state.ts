import crypto from 'crypto'

// Signs the OAuth `state` param with business_id + a timestamp, so the
// callback can trust which business initiated a given authorization
// instead of taking a plain business_id straight from the query string -
// without this, anyone could hit the callback with someone ELSE's
// business_id as state and connect their own Kommo account to a business
// they don't own. 10 minutes is generous for clicking through Kommo's own
// login/consent screen without leaving a stale state usable indefinitely.
const MAX_AGE_MS = 10 * 60 * 1000

function getSecret(): string {
  const secret = process.env.KOMMO_OAUTH_STATE_SECRET
  if (!secret) throw new Error('KOMMO_OAUTH_STATE_SECRET is not set')
  return secret
}

export function signState(businessId: string): string {
  const payload = `${businessId}.${Date.now()}`
  const signature = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex')
  return Buffer.from(`${payload}.${signature}`).toString('base64url')
}

/** Returns the business_id if `state` is a validly-signed, not-yet-expired
 * value from signState above - null for anything else (forged, tampered,
 * expired, or malformed). */
export function verifyState(state: string): string | null {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8')
    const [businessId, timestampStr, signature] = decoded.split('.')
    if (!businessId || !timestampStr || !signature) return null

    const payload = `${businessId}.${timestampStr}`
    const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex')
    const provided = Buffer.from(signature)
    const expectedBuf = Buffer.from(expected)
    if (provided.length !== expectedBuf.length || !crypto.timingSafeEqual(provided, expectedBuf)) return null

    if (Date.now() - Number(timestampStr) > MAX_AGE_MS) return null
    return businessId
  } catch {
    return null
  }
}
