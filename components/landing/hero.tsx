'use client'

import Link from 'next/link'
import { ArrowRight, Check, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/language-context'

// Stylized mock of the real DayView calendar (components/dashboard/
// calendar-view.tsx) - built from plain divs in the app's own chart-*
// color tokens rather than a screenshot, since no headless browser is
// available in this environment to capture a real one. Deliberately
// mirrors the actual grid's shape (gutter + columns + colored blocks) so
// a visitor who signs up recognizes it, not a generic dashboard mockup.
function CalendarMock() {
  const { t, locale } = useLanguage()
  const l = t.landing

  const blocks = [
    { col: 0, top: 8, height: 22, color: 'var(--chart-1)', label: 'Maria G.', time: '09:00' },
    { col: 1, top: 42, height: 30, color: 'var(--chart-2)', label: 'Carlos R.', time: '10:30' },
    { col: 0, top: 46, height: 22, color: 'var(--chart-3)', label: 'Ana P.', time: '11:00' },
    { col: 2, top: 12, height: 26, color: 'var(--chart-4)', label: 'Luis M.', time: '09:15' },
    { col: 1, top: 76, height: 18, color: 'var(--chart-1)', label: 'Sofia T.', time: '13:00' },
    { col: 2, top: 60, height: 24, color: 'var(--chart-2)', label: 'Diego F.', time: '12:00' },
  ]

  const formattedDate = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())

  return (
    <div className="relative w-full max-w-md rounded-2xl border bg-card p-4 shadow-2xl shadow-primary/10 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{l.heroMockToday}</p>
          <p className="text-xs text-muted-foreground capitalize">{formattedDate}</p>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          6 {l.heroMockBooked}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {['A', 'B', 'C'].map((letter) => (
          <div key={letter} className="truncate rounded-md bg-muted/60 px-1.5 py-1 text-center text-[10px] font-medium text-muted-foreground">
            {l.heroMockRoomPrefix} {letter}
          </div>
        ))}
      </div>
      <div className="relative mt-1.5 grid grid-cols-3 gap-1.5" style={{ height: 190 }}>
        {[0, 1, 2].map((col) => (
          <div key={col} className="relative rounded-md bg-muted/30">
            {[1, 2, 3].map((line) => (
              <div key={line} className="absolute inset-x-0 border-t border-border/50" style={{ top: `${line * 25}%` }} />
            ))}
          </div>
        ))}
        {blocks.map((b, i) => (
          <div
            key={i}
            className="absolute overflow-hidden rounded-md px-1.5 py-1 text-white shadow-sm"
            style={{
              left: `${(b.col / 3) * 100}%`,
              width: 'calc(33.333% - 6px)',
              top: `${b.top}%`,
              height: `${b.height}%`,
              backgroundColor: b.color,
              marginLeft: b.col > 0 ? '3px' : 0,
            }}
          >
            <p className="truncate text-[9px] font-semibold leading-tight">{b.label}</p>
            <p className="truncate text-[8px] leading-tight opacity-90">{b.time}</p>
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute -right-3 -top-3 flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium shadow-lg">
        <Sparkles className="h-3.5 w-3.5 text-accent" />
        <span>{l.heroMockNewBooking}</span>
      </div>
    </div>
  )
}

export function Hero() {
  const { t } = useLanguage()
  const l = t.landing

  const trustItems = [l.heroTrust1, l.heroTrust2, l.heroTrust3]

  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,var(--primary),transparent)] opacity-[0.08]" />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2 lg:py-28">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
            {l.heroBadge}
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-foreground text-balance sm:text-5xl lg:text-[3.25rem]">
            {l.heroTitle}
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground text-pretty">
            {l.heroSubtitle}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="gap-2">
              <Link href="/register">
                {l.heroCtaPrimary}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#como-funciona">{l.heroCtaSecondary}</a>
            </Button>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
            {trustItems.map((item) => (
              <span key={item} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Check className="h-4 w-4 shrink-0 text-primary" />
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">
          <CalendarMock />
        </div>
      </div>
    </section>
  )
}
