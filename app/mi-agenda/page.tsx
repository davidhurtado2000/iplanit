'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, ChevronLeft, ChevronRight, Clock, LogOut, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { LanguageToggle } from '@/components/language-toggle'
import { LogoLoader } from '@/components/logo-loader'
import { useAuth } from '@/hooks/use-auth'
import { useLanguage } from '@/context/language-context'
import { createClient } from '@/lib/supabase/client'
import { parseInTimezone, toDateStr } from '@/lib/timezone'
import { capitalizeFirst, cn } from '@/lib/utils'
import { countsAsServed, earningFor, formatMoney, summarizeEarnings, type PaySettings } from '@/lib/worker-pay'

// Read-only portal for worker accounts (scripts/104-worker-accounts.sql).
// Lives outside the (dashboard) route group on purpose: a worker account
// has no business of its own and no table-level access, so none of the
// dashboard's providers (business data, plan gating, notifications) apply.
// Everything here comes from two security-definer RPCs scoped to the
// signed-in user's own linked worker rows.

interface WorkerLink {
  worker_id: string
  worker_name: string
  photo_url: string | null
  color: string
  business_id: string
  business_name: string
  business_logo_url: string | null
  timezone: string
  currency: 'PEN' | 'USD'
  /** Pay settings (scripts/114) - undefined until that script runs. */
  pay_type?: 'commission' | 'salary' | null
  commission_pct?: number | null
  tip_worker_pct?: number | null
  pay_excludes_tax?: boolean | null
  workers_see_sales?: boolean | null
}

interface AgendaRow {
  id: string
  start_time: string
  end_time: string
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  type: 'booking' | 'visit'
  service_name: string | null
  service_color: string | null
  client_name: string | null
  notes: string | null
  price: number | null
  price_usd: number | null
  tip_amount?: number | null
  worker_pay_pct?: number | null
  tip_worker_pct?: number | null
  pay_excludes_tax?: boolean | null
}

type View = 'day' | 'week' | 'month'

function todayInTz(tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function addMonths(dateStr: string, months: number) {
  const d = new Date(dateStr.slice(0, 8) + '01T12:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

// Calendar dates have no timezone of their own, so the weekday is read in UTC.
function weekStart(dateStr: string) {
  const dow = new Date(dateStr + 'T12:00:00Z').getUTCDay()
  return addDays(dateStr, -((dow + 6) % 7))
}

function rangeFor(view: View, anchor: string): { start: string; end: string } {
  if (view === 'day') return { start: anchor, end: addDays(anchor, 1) }
  if (view === 'week') {
    const start = weekStart(anchor)
    return { start, end: addDays(start, 7) }
  }
  const start = anchor.slice(0, 8) + '01'
  return { start, end: addMonths(start, 1) }
}

export default function WorkerAgendaPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading, signOut } = useAuth()
  const { t, locale } = useLanguage()
  const tr = t.workerPortal
  const supabase = useMemo(() => createClient(), [])

  const [links, setLinks] = useState<WorkerLink[] | null>(null)
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null)
  const [view, setView] = useState<View>('day')
  const [anchor, setAnchor] = useState('')
  const [rows, setRows] = useState<AgendaRow[]>([])
  const [loadingRows, setLoadingRows] = useState(false)
  // A barber who also owns a business of their own (e.g. tried iPlanit
  // themselves before being invited) still needs a way to get to it.
  const [ownsBusiness, setOwnsBusiness] = useState(false)

  const link = links?.find((l) => l.worker_id === selectedWorkerId) ?? null
  const tz = link?.timezone || 'America/Lima'

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [authLoading, user, router])

  useEffect(() => {
    if (!user) return
    supabase
      .from('businesses')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id)
      .then(({ count }) => setOwnsBusiness((count ?? 0) > 0))
    supabase.rpc('get_my_worker_links').then(({ data }) => {
      const fetched = (data as WorkerLink[] | null) || []
      setLinks(fetched)
      if (fetched.length > 0) {
        setSelectedWorkerId(fetched[0].worker_id)
        setAnchor(todayInTz(fetched[0].timezone))
      }
    })
  }, [user, supabase])

  const range = anchor ? rangeFor(view, anchor) : null

  const loadRows = useCallback(async () => {
    if (!link || !range) return
    setLoadingRows(true)
    const { data } = await supabase.rpc('get_my_worker_agenda', {
      p_worker_id: link.worker_id,
      p_from: parseInTimezone(`${range.start}T00:00`, tz).toISOString(),
      p_to: parseInTimezone(`${range.end}T00:00`, tz).toISOString(),
    })
    setRows((data as AgendaRow[] | null) || [])
    setLoadingRows(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link?.worker_id, range?.start, range?.end, tz, supabase])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  // A barber checks this on their phone between cuts - coming back to the
  // tab should show what changed meanwhile without a manual reload.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadRows()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadRows])

  if (authLoading || !user || links === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LogoLoader />
      </div>
    )
  }

  if (links.length === 0 || !link || !range) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <CalendarDays className="h-10 w-10 text-muted-foreground/50" />
        <div className="max-w-sm space-y-2">
          <h1 className="text-lg font-semibold">{tr.noLinkTitle}</h1>
          <p className="text-sm text-muted-foreground">{tr.noLinkDesc}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard">{tr.goToDashboard}</Link>
          </Button>
          <Button variant="ghost" onClick={signOut}>
            {tr.signOut}
          </Button>
        </div>
      </div>
    )
  }

  const money = (row: AgendaRow) => (link.currency === 'USD' ? row.price_usd ?? row.price : row.price) ?? 0
  const currencySymbol = link.currency === 'USD' ? '$' : 'S/'
  const now = new Date()
  const served = rows.filter(
    (r) => r.status === 'completed' || (r.status === 'confirmed' && new Date(r.end_time) < now)
  )
  const stats = {
    appointments: rows.filter((r) => r.status !== 'cancelled').length,
    served: served.length,
    earned: served.reduce((sum, r) => sum + money(r), 0),
    noShows: rows.filter((r) => r.status === 'no_show').length,
  }
  // Commissions and tips (scripts/114, lib/worker-pay.ts) - once the
  // business sets up this worker's pay, "Generado" (full price) becomes
  // "Tu ganancia" (their share). Same maths as the owner's Analytics -> Pagos.
  const paySettings: PaySettings = {
    payType: link.pay_type ?? null,
    commissionPct: link.commission_pct ?? null,
    tipWorkerPct: Number(link.tip_worker_pct ?? 100),
    excludesTax: Boolean(link.pay_excludes_tax),
  }
  const payConfigured = Boolean(link.pay_type) || served.some((r) => r.worker_pay_pct !== null && r.worker_pay_pct !== undefined)
  const payRow = (r: AgendaRow) => ({ ...r, price: link.currency === 'USD' ? null : r.price, price_usd: link.currency === 'USD' ? r.price_usd ?? r.price : null })
  const earnings = summarizeEarnings(rows.map(payRow), paySettings, now)

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { timeZone: tz, hour: '2-digit', minute: '2-digit' })
  const fmtDay = (dateStr: string, opts: Intl.DateTimeFormatOptions) =>
    capitalizeFirst(new Date(dateStr + 'T12:00:00Z').toLocaleDateString(locale, { timeZone: 'UTC', ...opts }))

  const rangeLabel =
    view === 'day'
      ? fmtDay(range.start, { weekday: 'long', day: 'numeric', month: 'long' })
      : view === 'week'
        ? `${fmtDay(range.start, { day: 'numeric', month: 'short' })} – ${fmtDay(addDays(range.end, -1), {
            day: 'numeric',
            month: 'short',
          })}`
        : fmtDay(range.start, { month: 'long', year: 'numeric' })

  const shift = (direction: 1 | -1) => {
    setAnchor((a) =>
      view === 'day' ? addDays(a, direction) : view === 'week' ? addDays(a, 7 * direction) : addMonths(a, direction)
    )
  }

  const rowsByDay = rows.reduce<Record<string, AgendaRow[]>>((acc, row) => {
    const day = toDateStr(row.start_time, tz)
    ;(acc[day] ||= []).push(row)
    return acc
  }, {})
  const days = Object.keys(rowsByDay).sort()
  const isToday = anchor === todayInTz(tz)

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <img src="/logotipo_modolight.png" alt="iPlanit" className="h-6 w-auto dark:hidden" />
          <img src="/logotipo_mododark.png" alt="iPlanit" className="hidden h-6 w-auto dark:block" />
          <div className="flex items-center gap-1">
            <LanguageToggle className="mb-0 w-auto" />
            <Button variant="ghost" size="icon" onClick={signOut} aria-label={tr.signOut} title={tr.signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-5">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={link.photo_url || undefined} alt="" className="object-cover" />
            <AvatarFallback style={{ backgroundColor: `${link.color}22`, color: link.color }}>
              {link.worker_name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">
              {tr.greeting.replace('{name}', link.worker_name.split(' ')[0])}
            </h1>
            <p className="truncate text-sm text-muted-foreground">{link.business_name}</p>
          </div>
        </div>

        {links.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {links.map((l) => (
              <button
                key={l.worker_id}
                type="button"
                onClick={() => {
                  setSelectedWorkerId(l.worker_id)
                  setAnchor(todayInTz(l.timezone))
                }}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm transition-colors',
                  l.worker_id === link.worker_id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                )}
              >
                {l.business_name}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 rounded-lg border p-1">
          {(['day', 'week', 'month'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                'rounded-md py-1.5 text-sm font-medium transition-colors',
                view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {v === 'day' ? tr.viewDay : v === 'week' ? tr.viewWeek : tr.viewMonth}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="icon" onClick={() => shift(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex min-w-0 flex-col items-center">
            <span className="truncate text-sm font-medium">{rangeLabel}</span>
            {!isToday && (
              <button
                type="button"
                onClick={() => setAnchor(todayInTz(tz))}
                className="text-xs text-primary hover:underline"
              >
                {tr.today}
              </button>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={() => shift(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: tr.statAppointments, value: String(stats.appointments) },
            { label: tr.statServed, value: String(stats.served) },
            payConfigured
              ? { label: t.pay.portalEarnedTitle, value: formatMoney(earnings.total, currencySymbol) }
              : { label: tr.statEarned, value: `${currencySymbol} ${stats.earned.toFixed(0)}` },
            { label: tr.statNoShows, value: String(stats.noShows) },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>

        {payConfigured && earnings.served > 0 && (
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 rounded-lg border bg-card px-3 py-2 text-sm">
            <span>
              <span className="text-muted-foreground">{t.pay.portalServices}: </span>
              <span className="font-medium tabular-nums">{formatMoney(earnings.serviceShare, currencySymbol)}</span>
            </span>
            <span>
              <span className="text-muted-foreground">{t.pay.portalTips}: </span>
              <span className="font-medium tabular-nums">{formatMoney(earnings.tipShare, currencySymbol)}</span>
            </span>
            {link.workers_see_sales && (
              <span>
                <span className="text-muted-foreground">{t.pay.portalSales}: </span>
                <span className="font-medium tabular-nums">{formatMoney(earnings.sales + earnings.tips, currencySymbol)}</span>
              </span>
            )}
          </div>
        )}

        {loadingRows ? (
          <div className="flex justify-center py-10">
            <LogoLoader />
          </div>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            {view === 'day' ? tr.emptyDay : tr.emptyRange}
          </p>
        ) : (
          <div className="space-y-5">
            {days.map((day) => (
              <section key={day} className="space-y-2">
                {view !== 'day' && (
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {fmtDay(day, { weekday: 'long', day: 'numeric', month: 'short' })}
                  </h2>
                )}
                {rowsByDay[day].map((row) => {
                  const inactive = row.status === 'cancelled' || row.status === 'no_show'
                  return (
                    <div
                      key={row.id}
                      className={cn('flex gap-3 rounded-lg border bg-card p-3', inactive && 'opacity-60')}
                    >
                      <div
                        className="w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: row.service_color || link.color }}
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn('font-medium', row.status === 'cancelled' && 'line-through')}>
                            {row.client_name || '—'}
                          </p>
                          <span
                            className={cn(
                              'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                              row.status === 'confirmed' && 'bg-primary/10 text-primary',
                              row.status === 'completed' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                              row.status === 'pending' && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
                              inactive && 'bg-muted text-muted-foreground'
                            )}
                          >
                            {tr.status[row.status]}
                          </span>
                        </div>
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {fmtTime(row.start_time)} – {fmtTime(row.end_time)}
                          <span>·</span>
                          <span className="truncate">
                            {row.service_name || (row.type === 'visit' ? tr.visit : '—')}
                          </span>
                        </p>
                        {payConfigured && countsAsServed(row, now) && (
                          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                            {t.pay.rowShare.replace(
                              '{amount}',
                              formatMoney(earningFor(payRow(row), paySettings).total, currencySymbol)
                            )}
                          </p>
                        )}
                        {row.notes && (
                          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <StickyNote className="mt-0.5 h-3 w-3 shrink-0" />
                            <span className="whitespace-pre-wrap">{row.notes}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </section>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          {tr.readOnlyNote}{' '}
          <Link href="/mi-agenda/ayuda" className="text-primary hover:underline">
            {locale.startsWith('en') ? 'How does it work?' : '¿Cómo funciona?'}
          </Link>
        </p>

        {ownsBusiness && (
          <div className="pb-6 text-center">
            <Link
              href={profile?.requires_plan_selection ? '/onboarding/plan' : '/dashboard'}
              className="text-sm text-primary hover:underline"
            >
              {profile?.requires_plan_selection ? tr.activateOwnBusiness : tr.goToOwnBusiness}
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
