'use client'

import { useEffect, useId, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string
      remove: (widgetId: string) => void
    }
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
// Module-scoped so a page rendering more than one widget (shouldn't happen
// today, but cheap to make safe) only ever loads the script once.
let scriptPromise: Promise<void> | null = null

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = SCRIPT_SRC
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Failed to load Turnstile script'))
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

/**
 * Renders nothing (and blocks nothing) if NEXT_PUBLIC_TURNSTILE_SITE_KEY
 * isn't set - the corresponding server-side check (lib/turnstile.ts) fails
 * closed regardless, so an unconfigured environment shows no widget but
 * still can't complete the protected action, rather than silently
 * pretending to be protected.
 */
export function TurnstileWidget({
  onVerify,
  onExpire,
}: {
  onVerify: (token: string) => void
  onExpire?: () => void
}) {
  const rawId = useId()
  const containerId = `turnstile-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`
  const widgetIdRef = useRef<string | null>(null)
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  useEffect(() => {
    if (!siteKey) return
    let cancelled = false

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !window.turnstile) return
        widgetIdRef.current = window.turnstile.render(`#${containerId}`, {
          sitekey: siteKey,
          callback: onVerify,
          'expired-callback': () => onExpire?.(),
        })
      })
      .catch((err) => console.error('[iplanit] Turnstile load error:', err))

    return () => {
      cancelled = true
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
      }
    }
    // onVerify/onExpire are expected to be stable enough for widget lifetime -
    // re-running this on every render would re-mount the widget constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, containerId])

  if (!siteKey) return null

  return <div id={containerId} />
}
