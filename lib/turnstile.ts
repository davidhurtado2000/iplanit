// Server-only - verifies a Cloudflare Turnstile token against Cloudflare's
// own siteverify endpoint. Fails closed (returns false) if TURNSTILE_SECRET_KEY
// isn't configured, same fail-closed posture as CRON_SECRET/FEEDBACK_WEBHOOK_SECRET
// elsewhere in this app - a missing secret must never silently mean "skip
// the check", or bot protection would quietly do nothing in an environment
// where someone forgot to set the env var.
export async function verifyTurnstileToken(token: string | null | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret || !token) return false

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    })
    const data = (await response.json()) as { success?: boolean }
    return data.success === true
  } catch (err) {
    console.error('[iplanit] Turnstile verification request failed:', err)
    return false
  }
}
