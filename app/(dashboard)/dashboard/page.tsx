'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Calendar,
  TrendingUp,
  Users,
  Clock,
  ArrowRight,
  CalendarDays,
  DollarSign,
  Crown,
  MapPin,
  Lock,
} from 'lucide-react'
import Link from 'next/link'
import { UpgradeModal, FREE_LIMITS } from '@/components/upgrade-modal'
import { OnboardingBanner } from '@/components/dashboard/onboarding-banner'
import { useBusinesses } from '@/hooks/use-businesses'
import { useAuth } from '@/hooks/use-auth'
import { useLanguage } from '@/context/language-context'
import { useDashboardData } from '@/context/dashboard-data-context'

export default function DashboardPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const { businesses } = useBusinesses()
  const { t } = useLanguage()
  const { reservations, services, clients, loading: dataLoading } = useDashboardData()
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  const currentBusiness = businesses?.[0]
  const loading = authLoading || dataLoading

  // Compute today's reservations client-side using business timezone
  const todayReservations = useMemo(() => {
    if (!currentBusiness) return []
    const tz = currentBusiness.timezone || 'America/Lima'
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
    return reservations.filter((r) => {
      const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(r.start_time))
      return localDate === today && r.status !== 'cancelled'
    })
  }, [reservations, currentBusiness?.id, currentBusiness?.timezone])

  const servicesCount = services.length
  const clientsCount = clients.length

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
        hasReservations={todayReservations.length > 0}
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

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t.dashboard.reservationsToday}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{todayReservations.length}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t.dashboard.appointmentsSubtitle}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t.dashboard.businessCard}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-semibold text-foreground">
              {currentBusiness?.name || t.dashboard.notConfigured}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {currentBusiness?.timezone || ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t.dashboard.planCard}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge variant={isPremium ? 'default' : 'secondary'}>
                {isPremium ? t.dashboard.premium : t.dashboard.free}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {isPremium ? t.dashboard.allFeatures : t.dashboard.basicAccess}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t.dashboard.userCard}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{displayEmail}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t.dashboard.activeAccount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-5 w-5" />
              {t.dashboard.newReservation}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              {t.dashboard.createAppointment}
            </p>
            <Button asChild className="w-full" size="sm">
              <Link href="/dashboard/calendar">{t.dashboard.goToCalendar}</Link>
            </Button>
          </CardContent>
        </Card>

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

      {/* Upgrade Modal */}
      <UpgradeModal isOpen={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />
    </div>
  )
}
