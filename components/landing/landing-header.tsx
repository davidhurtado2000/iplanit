'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LanguageToggle } from '@/components/language-toggle'
import { useLanguage } from '@/context/language-context'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { href: '#funciones', key: 'navFeatures' as const },
  { href: '#para-tu-negocio', key: 'navIndustries' as const },
  { href: '#planes', key: 'navPricing' as const },
  { href: '#faq', key: 'navFaq' as const },
]

export function LandingHeader() {
  const { t } = useLanguage()
  const { user, loading } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const l = t.landing

  // While auth is still resolving, default to the logged-out CTAs rather
  // than a loading flash - a visitor who IS logged in only sees this for a
  // moment before it swaps to "Ir al Dashboard", never the other way
  // around (a logged-out visitor never briefly sees a dashboard link).
  const isLoggedIn = !loading && !!user

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <img src="/favicon-96x96.png" alt="" className="h-8 w-8 shrink-0 dark:hidden" />
          <img src="/favicon-96x96-white.png" alt="" className="hidden h-8 w-8 shrink-0 dark:block" />
          <img src="/logotipo_modolight.png" alt="iPlanit" className="h-6 w-auto dark:hidden" />
          <img src="/logotipo_mododark.png" alt="iPlanit" className="hidden h-6 w-auto dark:block" />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {l[link.key]}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <LanguageToggle className="mb-0 w-auto justify-start" />
          {isLoggedIn ? (
            <Button asChild size="sm">
              <Link href="/dashboard">{l.goToDashboard}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">{l.loginCta}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">{l.signupCta}</Link>
              </Button>
            </>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      <div
        className={cn(
          'overflow-hidden border-t bg-background transition-[max-height] duration-300 md:hidden',
          mobileOpen ? 'max-h-96' : 'max-h-0 border-t-0'
        )}
      >
        <div className="flex flex-col gap-1 px-4 py-4">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="rounded-md px-2 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
            >
              {l[link.key]}
            </a>
          ))}
          <div className="my-2 border-t" />
          <div className="flex items-center justify-between px-2">
            <LanguageToggle className="mb-0 w-auto justify-start" />
          </div>
          {isLoggedIn ? (
            <Button asChild className="mt-1 w-full">
              <Link href="/dashboard">{l.goToDashboard}</Link>
            </Button>
          ) : (
            <div className="mt-1 flex flex-col gap-2">
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">{l.loginCta}</Link>
              </Button>
              <Button asChild className="w-full">
                <Link href="/register">{l.signupCta}</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
