'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Clock,
  CalendarDays,
  Crown,
  Plus,
  Briefcase,
  Layers,
  BarChart3,
  Lock,
  Eye,
  Copy,
  Check,
  ExternalLink,
  Link2,
} from 'lucide-react'
import Link from 'next/link'
import { UpgradeModal } from '@/components/upgrade-modal'
import { OnboardingBanner } from '@/components/dashboard/onboarding-banner'
import { ReservationModal } from '@/components/dashboard/reservation-modal'
import { HeroKpiCard } from '@/components/dashboard/hero-kpi-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { VISIT_BLOCK_COLOR } from '@/components/dashboard/calendar-view'
import { useBusinesses } from '@/hooks/use-businesses'
import { useAuth } from '@/hooks/use-auth'
import { useLanguage } from '@/context/language-context'
import { useDashboardData, type Reservation } from '@/context/dashboard-data-context'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { capitalizeFirst } from '@/lib/utils'

export default function DashboardPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const { currentBusiness } = useBusinesses()
  const { t, locale } = useLanguage()
  const { reservations, services, clients, resources: allResources, loading: dataLoading, refetchReservations } = useDashboardData()
  // Parking spots aren't a real "resource" a client ever picks - same
  // exclusion as Services/Resources pages, so the count matches what those
  // pages themselves show.
  const resources = allResources.filter((r) => r.type !== 'parking')
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [upgradeModalPlan, setUpgradeModalPlan] = useState<'pro' | 'premium' | undefined>(undefined)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null)

  const loading = authLoading || dataLoading

  const tz = currentBusiness?.timezone || 'America/Lima'

  // Compute today's reservations client-side using business timezone
  const todayReservations = useMemo(() => {
    if (!currentBusiness) return []
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
    return reservations
      .filter((r) => {
        const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(r.start_time))
        return localDate === today && r.status !== 'cancelled'
      })
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }, [reservations, currentBusiness?.id, tz])

  // Same-day-last-week comparison would need more history than "yesterday",
  // but yesterday is enough to turn a bare count into a useful glance
  // without duplicating the deeper trend charts that already live in Analytics.
  const yesterdayReservationsCount = useMemo(() => {
    if (!currentBusiness) return 0
    const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(
      new Date(Date.now() - 24 * 60 * 60 * 1000)
    )
    return reservations.filter((r) => {
      const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(r.start_time))
      return localDate === yesterday && r.status !== 'cancelled'
    }).length
  }, [reservations, currentBusiness?.id, tz])

  const reservationsDelta = todayReservations.length - yesterdayReservationsCount

  const servicesCount = services.length
  const clientsCount = clients.length
  const resourcesCount = resources.length

  // Teaser number for the (possibly locked) Analytics card - real analytics
  // computation lives in lib/analytics.ts, this is deliberately simpler
  // since it's just meant to make the card worth a glance, not duplicate
  // that page. Month boundaries are forgiving enough that skipping the
  // timezone-exact date math used for "today" elsewhere on this page isn't
  // worth the extra complexity here.
  const monthReservationsCount = useMemo(() => {
    if (!currentBusiness) return 0
    const now = new Date()
    return reservations.filter((r) => {
      const d = new Date(r.start_time)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && r.status !== 'cancelled'
    }).length
  }, [reservations, currentBusiness?.id])

  const clientsMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients])
  const servicesMap = useMemo(() => Object.fromEntries(services.map((s) => [s.id, s])), [services])

  // Pro+Premium teaser card, same locked/unlocked pattern as the Analytics
  // card below - computed entirely client-side from data already loaded by
  // useDashboardData(), no extra query, no email, no AI cost involved.
  //
  // Calendar week (Monday-Sunday), not a rolling "last 7 days ending now" -
  // an earlier version anchored the window at `now`, which silently
  // excluded every future reservation (tomorrow, later this week) since
  // those have start_time > now. Working in local YYYY-MM-DD strings (same
  // trick as todayReservations above) sidesteps Date-object timezone
  // pitfalls entirely - string comparison already sorts correctly for that
  // format.
  const weekSummary = useMemo(() => {
    if (!currentBusiness) return null
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
    const todayNoonUtc = new Date(todayStr + 'T12:00:00Z')
    const dow = todayNoonUtc.getUTCDay() // 0=Sun...6=Sat
    const offsetToMonday = dow === 0 ? 6 : dow - 1

    const mondayThisWeek = new Date(todayNoonUtc)
    mondayThisWeek.setUTCDate(todayNoonUtc.getUTCDate() - offsetToMonday)
    const toDateStr = (d: Date) => d.toISOString().slice(0, 10)

    const startOfThisWeek = toDateStr(mondayThisWeek)
    const sundayThisWeek = new Date(mondayThisWeek)
    sundayThisWeek.setUTCDate(mondayThisWeek.getUTCDate() + 6)
    const endOfThisWeek = toDateStr(sundayThisWeek)
    const mondayLastWeek = new Date(mondayThisWeek)
    mondayLastWeek.setUTCDate(mondayThisWeek.getUTCDate() - 7)
    const startOfLastWeek = toDateStr(mondayLastWeek)

    const localDateOf = (isoTime: string) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(isoTime))

    const thisWeek = reservations.filter((r) => {
      const d = localDateOf(r.start_time)
      return d >= startOfThisWeek && d <= endOfThisWeek && r.status !== 'cancelled'
    })
    const lastWeekCount = reservations.filter((r) => {
      const d = localDateOf(r.start_time)
      return d >= startOfLastWeek && d < startOfThisWeek && r.status !== 'cancelled'
    }).length

    const serviceCounts = new Map<string, number>()
    thisWeek.forEach((r) => {
      if (r.service_id) serviceCounts.set(r.service_id, (serviceCounts.get(r.service_id) ?? 0) + 1)
    })
    let topServiceId: string | null = null
    let topServiceCount = 0
    serviceCounts.forEach((count, id) => {
      if (count > topServiceCount) {
        topServiceCount = count
        topServiceId = id
      }
    })

    const dayCounts = new Map<string, number>()
    thisWeek.forEach((r) => {
      dayCounts.set(localDateOf(r.start_time), (dayCounts.get(localDateOf(r.start_time)) ?? 0) + 1)
    })
    let busiestDate: string | null = null
    let busiestCount = 0
    dayCounts.forEach((count, date) => {
      if (count > busiestCount) {
        busiestCount = count
        busiestDate = date
      }
    })

    return {
      thisWeekCount: thisWeek.length,
      lastWeekCount,
      topServiceName: topServiceId ? servicesMap[topServiceId]?.name ?? null : null,
      busiestDayLabel: busiestDate
        ? capitalizeFirst(
            new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: tz }).format(
              new Date(busiestDate + 'T12:00:00Z')
            )
          )
        : null,
    }
  }, [reservations, currentBusiness?.id, tz, locale, servicesMap])

  const bookingLink =
    currentBusiness?.slug && typeof window !== 'undefined'
      ? `${window.location.origin}/reservar/${currentBusiness.slug}`
      : ''
  const [linkCopied, setLinkCopied] = useState(false)
  const handleCopyLink = async () => {
    if (!bookingLink) return
    await navigator.clipboard.writeText(bookingLink)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  const [followUpPrefill, setFollowUpPrefill] = useState<{
    clientId: string
    serviceId: string | null
    reservationId: string
  } | null>(null)

  const handleSelectReservation = (reservation: Reservation) => {
    setSelectedReservation(reservation)
    setFollowUpPrefill(null)
    setIsModalOpen(true)
  }

  // Switches the already-open modal from viewing the visit straight into a
  // prefilled create form - see the same handler in calendar/page.tsx.
  const handleCreateFollowUp = (source: { clientId: string; serviceId: string | null; reservationId: string }) => {
    setSelectedReservation(null)
    setFollowUpPrefill(source)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedReservation(null)
    setFollowUpPrefill(null)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="text-center">
        <p className="text-muted-foreground">{t.reservation.loading}</p>
      </div>
    )
  }

  const plan = (profile?.plan ?? 'free') as 'free' | 'pro' | 'premium'
  const isPremium = plan === 'premium'
  const isProOrPremium = plan === 'pro' || plan === 'premium'
  const displayName = profile?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'Usuario'
  const displayEmail = profile?.email || user.email || ''

  return (
    <div className="space-y-4 pb-20 sm:space-y-6 lg:pb-6">
      {/* Header */}
      <PageHeader
        title={t.dashboard.title}
        subtitle={`${t.welcome}, ${displayName}`}
        actions={
          <Button asChild size="sm" className="w-full sm:w-auto">
            <Link href="/dashboard/calendar">
              <Calendar className="mr-2 h-4 w-4" />
              {t.dashboard.viewCalendar}
            </Link>
          </Button>
        }
      />

      {/* Onboarding Banner */}
      <OnboardingBanner
        hasBusiness={!!currentBusiness}
        hasResources={resourcesCount > 0}
        hasServices={servicesCount > 0}
        hasClients={clientsCount > 0}
        hasReservations={reservations.length > 0}
      />

      {/* Free Plan Usage Banner - hidden for Pro and Premium, both already
          paying, neither needs the "upgrade" nag. */}
      {plan === 'free' && (
        <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 dark:border-amber-900 dark:from-amber-950/40 dark:to-orange-950/30">
          <CardContent className="py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3 sm:items-center">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
                  <Crown className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-200">{t.dashboard.freePlan}</p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {todayReservations.length} {t.dashboard.reservationsWord}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600"
                onClick={() => {
                  setUpgradeModalPlan(undefined)
                  setShowUpgradeModal(true)
                }}
              >
                <Crown className="h-4 w-4" />
                {t.dashboard.upgrade}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Today - the one thing that actually changes day to day, so it
            gets the visual weight instead of competing evenly with static
            account info. */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                {t.calendar.today}
              </CardTitle>
              <CardDescription>
                {capitalizeFirst(
                  new Date().toLocaleDateString(locale, {
                    timeZone: tz,
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })
                )}
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <div className="flex items-baseline gap-2">
                <div className="text-3xl font-bold">{todayReservations.length}</div>
                {reservationsDelta !== 0 && (
                  <span
                    className={`flex items-center gap-0.5 text-xs font-medium ${
                      reservationsDelta > 0 ? 'text-green-600' : 'text-muted-foreground'
                    }`}
                  >
                    {reservationsDelta > 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {reservationsDelta > 0 ? '+' : ''}
                    {reservationsDelta}
                  </span>
                )}
                {reservationsDelta === 0 && (
                  <Minus className="h-3 w-3 text-muted-foreground" />
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">
                {reservationsDelta === 0 ? t.dashboard.sameAsYesterday : t.dashboard.vsYesterday}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {todayReservations.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-10 text-center">
                <CalendarDays className="h-8 w-8 text-muted-foreground/50" />
                <div>
                  <p className="text-sm font-medium">{t.dashboard.noReservationsTodayTitle}</p>
                  <p className="text-xs text-muted-foreground">{t.dashboard.noReservationsTodayDesc}</p>
                </div>
                <Button asChild size="sm" className="gap-2">
                  <Link href="/dashboard/calendar">
                    <Plus className="h-4 w-4" />
                    {t.dashboard.newReservation}
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {todayReservations.slice(0, 5).map((reservation) => {
                  const client = clientsMap[reservation.client_id]
                  const service = reservation.service_id ? servicesMap[reservation.service_id] : undefined
                  const isVisit = reservation.type === 'visit'
                  return (
                    <button
                      key={reservation.id}
                      type="button"
                      onClick={() => handleSelectReservation(reservation)}
                      className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <div
                        className="h-9 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: isVisit ? VISIT_BLOCK_COLOR : service?.color ?? 'hsl(var(--primary))' }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1 truncate text-sm font-medium">
                          {isVisit && <Eye className="h-3 w-3 shrink-0" />}
                          {client?.name ?? t.calendar.unknownClient}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {service
                            ? `${isVisit ? `${t.calendar.interestedInShortLabel} ` : ''}${service.name}`
                            : isVisit
                              ? t.reservation.noServiceVisit
                              : t.calendar.unknownService}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(reservation.start_time).toLocaleTimeString(locale, {
                            timeZone: tz,
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                        <StatusBadge status={reservation.status} labels={t.reservation} className="h-4 px-1.5 text-[9px]" />
                      </div>
                    </button>
                  )
                })}
                {todayReservations.length > 5 && (
                  <Link
                    href="/dashboard/calendar"
                    className="block pt-1 text-center text-sm text-primary hover:underline"
                  >
                    {t.dashboard.viewAllReservations} ({todayReservations.length})
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account info - static reference data, so it's compact and
            secondary instead of competing with "Today" for attention. */}
        <Card>
          <CardContent className="divide-y p-0">
            <div className="p-4">
              <p className="text-xs font-medium text-muted-foreground">{t.dashboard.businessCard}</p>
              <p className="mt-1 truncate font-semibold text-foreground">
                {currentBusiness?.name || t.dashboard.notConfigured}
              </p>
              <p className="text-xs text-muted-foreground">{currentBusiness?.timezone || ''}</p>
            </div>
            <div className="p-4">
              <p className="text-xs font-medium text-muted-foreground">{t.dashboard.planCard}</p>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant={plan === 'free' ? 'secondary' : 'default'}>
                  {plan === 'premium' ? t.dashboard.premium : plan === 'pro' ? t.dashboard.pro : t.dashboard.free}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {plan === 'premium' ? t.dashboard.allFeatures : plan === 'pro' ? t.dashboard.proAccess : t.dashboard.basicAccess}
              </p>
            </div>
            <div className="p-4">
              <p className="text-xs font-medium text-muted-foreground">{t.dashboard.userCard}</p>
              <p className="mt-1 truncate text-sm font-medium">{displayEmail}</p>
              <p className="text-xs text-muted-foreground">{t.dashboard.activeAccount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tu semana (Pro+Premium) + link de reservas (todos los planes) - la
          primera se calcula 100% del lado del cliente con datos que
          useDashboardData() ya cargó (sin queries nuevas, sin email, sin
          IA); la segunda reutiliza el mismo bookingLink/handleCopyLink que
          ya existe en Settings, solo que aquí a la vista sin tener que
          entrar a Configuración. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              {t.dashboard.weekSummaryTitle}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isProOrPremium ? (
              weekSummary && weekSummary.thisWeekCount > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:divide-x">
                  <div className="sm:pr-4">
                    <p className="text-xs font-medium text-muted-foreground">{t.dashboard.weekSummaryReservations}</p>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-xl font-semibold">{weekSummary.thisWeekCount}</span>
                      {weekSummary.thisWeekCount !== weekSummary.lastWeekCount && (
                        <span
                          className={`flex items-center gap-0.5 text-xs font-medium ${
                            weekSummary.thisWeekCount > weekSummary.lastWeekCount
                              ? 'text-green-600'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {weekSummary.thisWeekCount > weekSummary.lastWeekCount ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {weekSummary.thisWeekCount > weekSummary.lastWeekCount ? '+' : ''}
                          {weekSummary.thisWeekCount - weekSummary.lastWeekCount}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{t.dashboard.weekSummaryVsLastWeek}</p>
                  </div>
                  <div className="sm:px-4">
                    <p className="text-xs font-medium text-muted-foreground">{t.dashboard.weekSummaryTopService}</p>
                    <p className="mt-1 truncate text-xl font-semibold">{weekSummary.topServiceName ?? '—'}</p>
                  </div>
                  <div className="sm:pl-4">
                    <p className="text-xs font-medium text-muted-foreground">{t.dashboard.weekSummaryBusiestDay}</p>
                    <p className="mt-1 truncate text-xl font-semibold">{weekSummary.busiestDayLabel ?? '—'}</p>
                  </div>
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">{t.dashboard.weekSummaryNoData}</p>
              )
            ) : (
              <button
                type="button"
                onClick={() => {
                  setUpgradeModalPlan('pro')
                  setShowUpgradeModal(true)
                }}
                className="flex w-full items-center gap-3 py-2 text-left"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{t.dashboard.weekSummaryUnlockDesc}</p>
                  <p className="text-xs text-muted-foreground">{t.dashboard.clickToUnlock}</p>
                </div>
              </button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              {t.settings.bookingLinkTitle}
            </CardTitle>
            <CardDescription>{t.settings.bookingLinkDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            {bookingLink ? (
              <div className="space-y-2">
                <Input value={bookingLink} readOnly className="font-mono text-xs" />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleCopyLink} className="flex-1 gap-2">
                    {linkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {linkCopied ? t.settings.linkCopied : t.settings.copyLink}
                  </Button>
                  <Button type="button" variant="outline" size="icon" asChild>
                    <a href={bookingLink} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t.dashboard.notConfigured}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions - the count each links to (already computed above for
          the onboarding banner) turns these into an actual at-a-glance stat
          instead of just repeating what the sidebar nav already says.
          Services/Resources/Analytics are hidden for the "sales" role, same
          restriction the sidebar itself already applies to those 3 pages -
          no point linking somewhere that role can't open. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link href="/dashboard/clients" className="block">
              <HeroKpiCard
                label={t.dashboard.clientsCard}
                icon={Users}
                iconClassName="bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
                value={clientsCount}
                caption={t.dashboard.manageClients}
                className="cursor-pointer transition-shadow hover:shadow-md"
              />
            </Link>
          </TooltipTrigger>
          <TooltipContent>{t.dashboard.clickToSeeMore}</TooltipContent>
        </Tooltip>

        {currentBusiness?.role !== 'sales' && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/dashboard/services" className="block">
                  <HeroKpiCard
                    label={t.dashboard.servicesCard}
                    icon={Briefcase}
                    iconClassName="bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400"
                    value={servicesCount}
                    caption={t.dashboard.configureServices}
                    className="cursor-pointer transition-shadow hover:shadow-md"
                  />
                </Link>
              </TooltipTrigger>
              <TooltipContent>{t.dashboard.clickToSeeMore}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/dashboard/resources" className="block">
                  <HeroKpiCard
                    label={t.dashboard.resourcesCard}
                    icon={Layers}
                    iconClassName="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                    value={resourcesCount}
                    caption={t.dashboard.manageResources}
                    className="cursor-pointer transition-shadow hover:shadow-md"
                  />
                </Link>
              </TooltipTrigger>
              <TooltipContent>{t.dashboard.clickToSeeMore}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                {isPremium ? (
                  <Link href="/dashboard/analytics" className="block">
                    <HeroKpiCard
                      label={t.dashboard.analyticsCard}
                      icon={BarChart3}
                      iconClassName="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                      value={monthReservationsCount}
                      caption={t.dashboard.reservationsThisMonth}
                      className="cursor-pointer transition-shadow hover:shadow-md"
                    />
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setUpgradeModalPlan('premium')
                      setShowUpgradeModal(true)
                    }}
                    className="block w-full text-left"
                  >
                    <HeroKpiCard
                      label={t.dashboard.analyticsCard}
                      icon={BarChart3}
                      iconClassName="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                      value={<Lock className="h-6 w-6 text-muted-foreground" />}
                      caption={t.dashboard.unlockAnalyticsDesc}
                      className="cursor-pointer transition-shadow hover:shadow-md"
                    />
                  </button>
                )}
              </TooltipTrigger>
              <TooltipContent>{isPremium ? t.dashboard.clickToSeeMore : t.dashboard.clickToUnlock}</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      <ReservationModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        reservation={selectedReservation}
        mode={followUpPrefill ? 'create' : 'view'}
        onSave={refetchReservations}
        prefillClientId={followUpPrefill?.clientId}
        prefillServiceId={followUpPrefill?.serviceId}
        followUpOfReservationId={followUpPrefill?.reservationId}
        onCreateFollowUp={handleCreateFollowUp}
      />

      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        requiredPlan={upgradeModalPlan}
      />
    </div>
  )
}
