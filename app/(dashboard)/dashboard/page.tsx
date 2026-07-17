'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
} from 'lucide-react'
import Link from 'next/link'
import { UpgradeModal } from '@/components/upgrade-modal'
import { OnboardingBanner } from '@/components/dashboard/onboarding-banner'
import { ReservationModal } from '@/components/dashboard/reservation-modal'
import { useBusinesses } from '@/hooks/use-businesses'
import { useAuth } from '@/hooks/use-auth'
import { useLanguage } from '@/context/language-context'
import { useDashboardData, type Reservation } from '@/context/dashboard-data-context'
import { getStatusBadgeVariant, getStatusLabel } from '@/lib/reservation-status'
import { capitalizeFirst } from '@/lib/utils'

export default function DashboardPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const { currentBusiness } = useBusinesses()
  const { t, locale } = useLanguage()
  const { reservations, services, clients, loading: dataLoading, refetchReservations } = useDashboardData()
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
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

  const clientsMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients])
  const servicesMap = useMemo(() => Object.fromEntries(services.map((s) => [s.id, s])), [services])

  const handleSelectReservation = (reservation: Reservation) => {
    setSelectedReservation(reservation)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedReservation(null)
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

  const isPremium = profile?.plan === 'premium'
  const displayName = profile?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'Usuario'
  const displayEmail = profile?.email || user.email || ''

  return (
    <div className="space-y-4 pb-20 sm:space-y-6 lg:pb-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">{t.dashboard.title}</h1>
          <p className="text-sm text-muted-foreground">
            {t.welcome}, {displayName}
          </p>
        </div>
        <Button asChild size="sm" className="w-full sm:w-auto">
          <Link href="/dashboard/calendar">
            <Calendar className="mr-2 h-4 w-4" />
            {t.dashboard.viewCalendar}
          </Link>
        </Button>
      </div>

      {/* Onboarding Banner */}
      <OnboardingBanner
        hasBusiness={!!currentBusiness}
        hasServices={servicesCount > 0}
        hasClients={clientsCount > 0}
        hasReservations={reservations.length > 0}
      />

      {/* Free Plan Usage Banner */}
      {!isPremium && (
        <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50">
          <CardContent className="py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3 sm:items-center">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                  <Crown className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-amber-900">{t.dashboard.freePlan}</p>
                  <p className="text-xs text-amber-700">
                    {todayReservations.length} {t.dashboard.reservationsWord}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600"
                onClick={() => setShowUpgradeModal(true)}
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
                  const service = servicesMap[reservation.service_id]
                  return (
                    <button
                      key={reservation.id}
                      type="button"
                      onClick={() => handleSelectReservation(reservation)}
                      className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <div
                        className="h-9 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: service?.color ?? 'hsl(var(--primary))' }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {client?.name ?? t.calendar.unknownClient}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {service?.name ?? t.calendar.unknownService}
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
                        <Badge variant={getStatusBadgeVariant(reservation.status)} className="h-4 px-1.5 text-[9px]">
                          {getStatusLabel(reservation.status, t.reservation)}
                        </Badge>
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
                <Badge variant={isPremium ? 'default' : 'secondary'}>
                  {isPremium ? t.dashboard.premium : t.dashboard.free}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {isPremium ? t.dashboard.allFeatures : t.dashboard.basicAccess}
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

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5" />
              {t.dashboard.clientsCard}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              {t.dashboard.manageClients}
            </p>
            <Button asChild className="w-full" size="sm" variant="outline">
              <Link href="/dashboard/clients">{t.dashboard.viewClients}</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-5 w-5" />
              {t.dashboard.servicesCard}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              {t.dashboard.configureServices}
            </p>
            <Button asChild className="w-full" size="sm" variant="outline">
              <Link href="/dashboard/services">{t.dashboard.viewServices}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <ReservationModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        reservation={selectedReservation}
        mode="view"
        onSave={refetchReservations}
      />

      {/* Upgrade Modal */}
      <UpgradeModal isOpen={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />
    </div>
  )
}
