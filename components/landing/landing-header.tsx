'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LanguageToggle } from '@/components/language-toggle'
import { useLanguage } from '@/context/language-context'
import { useAuth } from '@/hooks/use-auth'
import { VERTICALS } from '@/lib/verticals'
import { cn } from '@/lib/utils'

// "Para tu negocio" used to be an anchor scrolling to the home page's
// Industries chips - now a dropdown of real, indexable /negocios/[slug]
// pages (Estructura-Contenido-Blog-iPlanit.md section 7). Kept out of
// NAV_LINKS since it needs its own dropdown markup, not a plain link.
//
// The other anchors are prefixed with "/" (not bare "#funciones") because
// this header also renders on pages other than the home (/negocios/*) -
// a bare hash only scrolls within whatever page you're already on, so
// clicking it from a page with no id="funciones" silently did nothing.
// "/#funciones" always navigates to the home page first, then scrolls.
const NAV_LINKS = [
  { href: '/#funciones', key: 'navFeatures' as const },
  { href: '/#planes', key: 'navPricing' as const },
  { href: '/#faq', key: 'navFaq' as const },
  { href: '/blog', key: 'navBlog' as const },
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
          <Link href="/#funciones" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            {l.navFeatures}
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              {l.navIndustries}
              <ChevronDown className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {VERTICALS.map((v) => {
                const label = l.verticals[v.slug as keyof typeof l.verticals]?.navLabel
                return (
                  <DropdownMenuItem key={v.slug} asChild>
                    <Link href={`/negocios/${v.slug}`} className="gap-2">
                      <v.icon className="h-4 w-4 text-primary" />
                      {label}
                    </Link>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {NAV_LINKS.filter((link) => link.key !== 'navFeatures').map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {l[link.key]}
            </Link>
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
          mobileOpen ? 'max-h-[32rem] overflow-y-auto' : 'max-h-0 border-t-0'
        )}
      >
        <div className="flex flex-col gap-1 px-4 py-4">
          <Link
            href="/#funciones"
            onClick={() => setMobileOpen(false)}
            className="rounded-md px-2 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            {l.navFeatures}
          </Link>

          {/* Flattened instead of a nested dropdown - easier to tap through
              on a touch screen than a menu-inside-a-slide-down-panel. */}
          <p className="px-2 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {l.navIndustries}
          </p>
          {VERTICALS.map((v) => {
            const label = l.verticals[v.slug as keyof typeof l.verticals]?.navLabel
            return (
              <Link
                key={v.slug}
                href={`/negocios/${v.slug}`}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 rounded-md px-2 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                <v.icon className="h-4 w-4 text-primary" />
                {label}
              </Link>
            )
          })}

          <div className="my-1" />
          {NAV_LINKS.filter((link) => link.key !== 'navFeatures').map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="rounded-md px-2 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
            >
              {l[link.key]}
            </Link>
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
