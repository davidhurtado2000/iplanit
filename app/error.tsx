'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/language-context'

/**
 * Root error boundary (Next.js App Router convention - catches any
 * uncaught client-side exception in a page/nested route below this one).
 * Without this file, Next.js falls back to its own generic "Application
 * error: a client-side exception has occurred" screen, which is what
 * showed up when the unguarded navigator.clipboard.writeText() call
 * crashed the dashboard (now fixed) - this doesn't prevent a future bug
 * from throwing, but it stops the user from being stranded on that raw,
 * unbranded message with no way forward.
 */
const DETAILS = {
  es: { summary: 'Detalles técnicos', copy: 'Copiar detalles', copied: 'Copiado', hint: 'Si el error se repite, mándanos una captura de esto.' },
  en: { summary: 'Technical details', copy: 'Copy details', copied: 'Copied', hint: 'If the error keeps happening, send us a screenshot of this.' },
}

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t, language } = useLanguage()
  const d = DETAILS[language === 'en' ? 'en' : 'es']
  const [copied, setCopied] = useState(false)
  // The technical details are for whoever supports the app, not for the
  // customer, so they stay hidden: tap the title 5 times to reveal them (works
  // on a phone, where there is no console). Error messages can carry data
  // (e.g. a database error quoting an email), so nobody sees them by accident.
  const [taps, setTaps] = useState(0)
  const showDetails = taps >= 5
  // What support needs to find the cause: the message, where it happened (the
  // first lines of the stack) and the page. No personal data in any of it.
  const details = [
    `${error?.name ?? 'Error'}: ${error?.message ?? ''}`,
    ...(error?.stack ? error.stack.split('\n').slice(1, 7).map((l) => l.trim()) : []),
    error?.digest ? `digest: ${error.digest}` : '',
    typeof window !== 'undefined' ? `page: ${window.location.pathname}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  useEffect(() => {
    console.error('[iplanit] Uncaught client-side error:', error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <img src="/favicon-96x96.png" alt="" className="h-12 w-12 dark:hidden" />
      <img src="/favicon-96x96-white.png" alt="" className="hidden h-12 w-12 dark:block" />
      <div className="flex items-center gap-2 text-foreground" onClick={() => setTaps((n) => n + 1)}>
        <AlertTriangle className="h-5 w-5 text-amber-500" />
        <h1 className="text-lg font-semibold">{t.errorTitle}</h1>
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">{t.errorDescription}</p>
      {showDetails && (
      <div className="w-full max-w-sm text-left text-xs text-muted-foreground">
        <p className="text-center font-medium">{d.summary}</p>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-2">{details}</pre>
        <p className="mt-2 text-center">{d.hint}</p>
        <div className="mt-2 text-center">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(details)
                setCopied(true)
              } catch {
                /* clipboard may be blocked; the text above can still be selected */
              }
            }}
          >
            {copied ? d.copied : d.copy}
          </Button>
        </div>
      </div>
      )}
      <div className="flex gap-2">
        <Button onClick={() => reset()} className="gap-2">
          <RotateCw className="h-4 w-4" />
          {t.errorRetry}
        </Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t.errorReload}
        </Button>
      </div>
    </div>
  )
}
