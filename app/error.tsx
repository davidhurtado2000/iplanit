'use client'

import { useEffect } from 'react'
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
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useLanguage()

  useEffect(() => {
    console.error('[iplanit] Uncaught client-side error:', error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <img src="/favicon-96x96.png" alt="" className="h-12 w-12 dark:hidden" />
      <img src="/favicon-96x96-white.png" alt="" className="hidden h-12 w-12 dark:block" />
      <div className="flex items-center gap-2 text-foreground">
        <AlertTriangle className="h-5 w-5 text-amber-500" />
        <h1 className="text-lg font-semibold">{t.errorTitle}</h1>
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">{t.errorDescription}</p>
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
