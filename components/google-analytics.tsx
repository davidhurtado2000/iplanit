'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Script from 'next/script'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'

// Marketing/conversion pages only - excludes /dashboard (logged-in product
// usage, not something Google Analytics needs to see) and /reservar (each
// business's own end clients booking an appointment - tracking THEM with
// iPlanit's own analytics would mean collecting behavioral data about
// people who have no relationship with iPlanit and never agreed to it, and
// it would dilute the actual signal this is for: understanding how
// prospects find and evaluate iPlanit itself). Same reasoning
// app/robots.ts already applies to what's worth exposing to search engines.
const EXCLUDED_PREFIXES = ['/dashboard', '/reservar']
const CONSENT_STORAGE_KEY = 'cookie-consent'

type Consent = 'accepted' | 'rejected' | null

/**
 * Owns both the consent banner AND whether the gtag.js script actually
 * loads - a banner that doesn't really gate anything would be decorative,
 * not consent. Nothing (script or banner) renders until localStorage has
 * been read client-side, so a visitor who already chose never sees the
 * banner flash again, and one who hasn't chosen never gets tracked before
 * choosing.
 */
export function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  const pathname = usePathname()
  const { t } = useLanguage()
  const [consent, setConsent] = useState<Consent>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setConsent(localStorage.getItem(CONSENT_STORAGE_KEY) as Consent)
    setHydrated(true)
  }, [])

  const handleChoice = (choice: 'accepted' | 'rejected') => {
    localStorage.setItem(CONSENT_STORAGE_KEY, choice)
    setConsent(choice)
  }

  if (EXCLUDED_PREFIXES.some((prefix) => pathname?.startsWith(prefix))) return null

  return (
    <>
      {consent === 'accepted' && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${measurementId}');
            `}
          </Script>
        </>
      )}

      {hydrated && consent === null && (
        <div className="fixed inset-x-0 bottom-0 z-[100] border-t bg-card p-4 shadow-lg sm:p-6">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {t.cookieConsent.message}{' '}
              <a href="/privacy" className="underline hover:text-foreground">
                {t.cookieConsent.learnMore}
              </a>
            </p>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" onClick={() => handleChoice('rejected')}>
                {t.cookieConsent.reject}
              </Button>
              <Button size="sm" onClick={() => handleChoice('accepted')}>
                {t.cookieConsent.accept}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
