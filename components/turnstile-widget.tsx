'use client'

import { forwardRef, useEffect, useId, useImperativeHandle, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string
      remove: (widgetId: string) => void
      reset: (widgetId: string) => void
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

export interface TurnstileWidgetHandle {
  /** Turnstile tokens are single-use - after ANY failed submission (wrong
   * password, not just a captcha failure), the token already sent is spent
   * even though the widget still visually shows its checkmark from the
   * first verify. Callers must call this after a failed submit so the next
   * attempt gets a fresh token instead of silently resending the stale one
   * and failing with a confusing "couldn't verify you're human" error. */
  reset: () => void
}

/**
 * Renders nothing (and blocks nothing) if NEXT_PUBLIC_TURNSTILE_SITE_KEY
 * isn't set - the corresponding server-side check (lib/turnstile.ts) fails
 * closed regardless, so an unconfigured environment shows no widget but
 * still can't complete the protected action, rather than silently
 * pretending to be protected.
 */
export const TurnstileWidget = forwardRef<
  TurnstileWidgetHandle,
  {
    onVerify: (token: string) => void
    onExpire?: () => void
  }
>(function TurnstileWidget({ onVerify, onExpire }, ref) {
  const rawId = useId()
  const containerId = `turnstile-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`
  const widgetIdRef = useRef<string | null>(null)
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current)
      }
    },
  }))

  useEffect(() => {
    if (!siteKey) return
    let cancelled = false

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !window.turnstile) return
        // The script load is async and shared across instances (module-scoped
        // scriptPromise) - by the time it resolves, this widget's own
        // container can already be gone (e.g. the user stepped back in a
        // multi-step form before the script finished loading). The
        // `cancelled` flag alone doesn't cover that: it's only set by THIS
        // effect's own cleanup, which has nothing to do with whether the div
        // is still in the DOM. Turnstile's render() throws/logs "Unable to
        // find a container" instead of failing silently, so check first.
        if (!document.getElementById(containerId)) return
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
})
