'use client'

import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'

/**
 * Full-page loading moment (app boot, auth checks, route transitions) -
 * distinct from components/ui/skeleton.tsx, which is for content loading
 * inside an already-visible page shell (lists, cards). Bobs the whole logo
 * rather than animating parts of it - the source logo is a flat image
 * (favicon.svg just wraps an embedded PNG, confirmed while investigating
 * David's "animate the duck's wings" request), so there's no separate wing
 * layer to move independently without new artwork from him.
 */
export function LogoLoader({ className }: { className?: string }) {
  const { language } = useLanguage()

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <img src="/favicon-96x96.png" alt="" className="h-12 w-12 animate-logo-bob dark:hidden" />
      <img src="/favicon-96x96-white.png" alt="" className="hidden h-12 w-12 animate-logo-bob dark:block" />
      <p className="text-sm text-muted-foreground">{language === 'es' ? 'Cargando...' : 'Loading...'}</p>
    </div>
  )
}
