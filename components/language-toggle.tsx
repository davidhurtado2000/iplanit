'use client'

import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'

// Shared by the public booking pages (app/reservar/[slug] and
// app/reservar/cita/[id]) - both used to carry an identical copy-pasted
// block of raw <button> markup with a ~20px tap target, well under the
// ~24px WCAG AA minimum. Built on the Button primitive (size="sm" = 32px)
// so it matches the rest of the app's control sizing instead of its own
// one-off styling.
export function LanguageToggle({ className }: { className?: string }) {
  const { language, setLanguage } = useLanguage()

  return (
    <div className={cn('mb-4 flex w-full max-w-lg justify-end', className)}>
      <div className="inline-flex overflow-hidden rounded-md border">
        <Button
          type="button"
          variant={language === 'en' ? 'default' : 'ghost'}
          size="sm"
          className="rounded-none px-3 text-xs"
          onClick={() => setLanguage('en')}
        >
          EN
        </Button>
        <Button
          type="button"
          variant={language === 'es' ? 'default' : 'ghost'}
          size="sm"
          className="rounded-none border-l px-3 text-xs"
          onClick={() => setLanguage('es')}
        >
          ES
        </Button>
      </div>
    </div>
  )
}
