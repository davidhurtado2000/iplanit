'use client'

import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PremiumFeature } from '@/components/premium-feature'
import { Button } from '@/components/ui/button'
import {
  CalendarDays,
  DollarSign,
  Gauge,
  Trophy,
  UserX,
  Building2,
  Eye,
  Download,
  XCircle,
  Receipt,
  Users,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import { useBusinesses } from '@/hooks/use-businesses'
import { useDashboardData } from '@/context/dashboard-data-context'
import { useLanguage } from '@/context/language-context'
import { toCsv, downloadCsv } from '@/lib/csv'
import { getStatusLabel } from '@/lib/reservation-status'
import { cn } from '@/lib/utils'
import {
  getRangeBounds,
  getPreviousRangeBounds,
  computeTrend,
  getDailyDemand,
  getHourlyDemand,
  getServiceBreakdown,
  getTotalRevenue,
  getOccupancy,
  getNoShowRate,
  getVisitsCount,
  getCancellationRate,
  getAverageTicket,
  getClientRetention,
  getTopClients,
  type DateRangeOption,
  type TrendResult,
} from '@/lib/analytics'

/** Small colored delta next to a KPI's headline number - null while there's no previous-period baseline to compare against. `invert` flips the color logic for KPIs where going up is bad (no-show/cancellation rate). */
function TrendBadge({ trend, invert = false }: { trend: TrendResult; invert?: boolean }) {
  if (trend.changePct === null) return null
  if (trend.changePct === 0) {
    return <span className="text-xs font-medium text-muted-foreground">0%</span>
  }
  const isIncrease = trend.changePct > 0
  const isGood = invert ? !isIncrease : isIncrease
  const Icon = isIncrease ? ArrowUp : ArrowDown
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium',
        isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
      )}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(trend.changePct)}%
    </span>
  )
}

export default function AnalyticsPage() {
  const { currentBusiness, loading: businessLoading } = useBusinesses()
  const {
    reservations,
    clients,
    services,
    resources,
    businessHours,
    loading: dataLoading,
    ensureReservationsInRange,
  } = useDashboardData()
  const { t, locale } = useLanguage()
  const tr = t.analytics
  const [range, setRange] = useState<DateRangeOption>('30d')

  const timezone = currentBusiness?.timezone || 'America/Lima'
  const currencySymbol = currentBusiness?.currency === 'USD' ? '$' : 'S/'
  const loading = businessLoading || dataLoading

  const { from, to } = useMemo(() => getRangeBounds(range), [range])
  // "vs. previous period" needs data older than what's loaded by default
  // (dashboard-data-context only keeps ±90 days) - this is the one place
  // that on-demand expansion exists for.
  const { from: prevFrom, to: prevTo } = useMemo(() => getPreviousRangeBounds(from, to), [from, to])
  useEffect(() => {
    ensureReservationsInRange(prevFrom, prevTo)
  }, [prevFrom, prevTo, ensureReservationsInRange])

  const dailyDemand = useMemo(
    () => getDailyDemand(reservations, from, to, timezone, locale),
    [reservations, from, to, timezone, locale]
  )
  const hourlyDemand = useMemo(
    () => getHourlyDemand(reservations, from, to, timezone),
    [reservations, from, to, timezone]
  )
  const serviceBreakdown = useMemo(
    () => getServiceBreakdown(reservations, services, from, to),
    [reservations, services, from, to]
  )
  const revenueByService = useMemo(
    () => [...serviceBreakdown].sort((a, b) => b.revenue - a.revenue),
    [serviceBreakdown]
  )
  const totalRevenue = useMemo(() => getTotalRevenue(serviceBreakdown), [serviceBreakdown])
  const occupancy = useMemo(
    () => getOccupancy(reservations, businessHours, from, to, timezone),
    [reservations, businessHours, from, to, timezone]
  )
  const noShowRate = useMemo(
    () => getNoShowRate(reservations, from, to),
    [reservations, from, to]
  )
  const visitsCount = useMemo(
    () => getVisitsCount(reservations, from, to),
    [reservations, from, to]
  )
  const totalReservations = useMemo(
    () => serviceBreakdown.reduce((sum, s) => sum + s.count, 0),
    [serviceBreakdown]
  )
  const topService = serviceBreakdown[0]
  const cancellationRate = useMemo(() => getCancellationRate(reservations, from, to), [reservations, from, to])
  const averageTicket = useMemo(() => getAverageTicket(reservations, from, to), [reservations, from, to])
  const clientRetention = useMemo(
    () => getClientRetention(reservations, clients, from, to),
    [reservations, clients, from, to]
  )
  const topClients = useMemo(
    () => getTopClients(reservations, clients, from, to),
    [reservations, clients, from, to]
  )

  // Previous-period equivalents, purely to compute the trend badges below -
  // none of these are rendered on their own.
  const prevServiceBreakdown = useMemo(
    () => getServiceBreakdown(reservations, services, prevFrom, prevTo),
    [reservations, services, prevFrom, prevTo]
  )
  const prevTotalReservations = useMemo(
    () => prevServiceBreakdown.reduce((sum, s) => sum + s.count, 0),
    [prevServiceBreakdown]
  )
  const prevTotalRevenue = useMemo(() => getTotalRevenue(prevServiceBreakdown), [prevServiceBreakdown])
  const prevOccupancy = useMemo(
    () => getOccupancy(reservations, businessHours, prevFrom, prevTo, timezone),
    [reservations, businessHours, prevFrom, prevTo, timezone]
  )
  const prevNoShowRate = useMemo(() => getNoShowRate(reservations, prevFrom, prevTo), [reservations, prevFrom, prevTo])
  const prevVisitsCount = useMemo(() => getVisitsCount(reservations, prevFrom, prevTo), [reservations, prevFrom, prevTo])
  const prevCancellationRate = useMemo(
    () => getCancellationRate(reservations, prevFrom, prevTo),
    [reservations, prevFrom, prevTo]
  )
  const prevAverageTicket = useMemo(
    () => getAverageTicket(reservations, prevFrom, prevTo),
    [reservations, prevFrom, prevTo]
  )

  const reservationsTrend = useMemo(
    () => computeTrend(totalReservations, prevTotalReservations),
    [totalReservations, prevTotalReservations]
  )
  const revenueTrend = useMemo(() => computeTrend(totalRevenue, prevTotalRevenue), [totalRevenue, prevTotalRevenue])
  const occupancyTrend = useMemo(() => computeTrend(occupancy.rate, prevOccupancy.rate), [occupancy.rate, prevOccupancy.rate])
  const noShowTrend = useMemo(() => computeTrend(noShowRate.rate, prevNoShowRate.rate), [noShowRate.rate, prevNoShowRate.rate])
  const visitsTrend = useMemo(() => computeTrend(visitsCount, prevVisitsCount), [visitsCount, prevVisitsCount])
  const cancellationTrend = useMemo(
    () => computeTrend(cancellationRate.rate, prevCancellationRate.rate),
    [cancellationRate.rate, prevCancellationRate.rate]
  )
  const averageTicketTrend = useMemo(
    () => computeTrend(averageTicket, prevAverageTicket),
    [averageTicket, prevAverageTicket]
  )

  // Includes cancelled/no-show reservations too (unlike the KPIs above,
  // which deliberately exclude them) - an export meant for bookkeeping
  // should show the full record with its real status, not a pre-filtered
  // subset that would look like data went missing.
  const handleExportReservations = () => {
    const inRange = reservations.filter((r) => {
      const start = new Date(r.start_time)
      return start >= from && start <= to
    })
    const csv = toCsv(inRange, [
      {
        label: tr.exportColDate,
        value: (r) => new Date(r.start_time).toLocaleDateString(locale, { timeZone: timezone }),
      },
      {
        label: tr.exportColTime,
        value: (r) => new Date(r.start_time).toLocaleTimeString(locale, { timeZone: timezone, hour: '2-digit', minute: '2-digit' }),
      },
      { label: tr.exportColClient, value: (r) => clients.find((c) => c.id === r.client_id)?.name },
      { label: tr.exportColService, value: (r) => services.find((s) => s.id === r.service_id)?.name },
      { label: tr.exportColResource, value: (r) => resources.find((res) => res.id === r.resource_id)?.name },
      { label: tr.exportColType, value: (r) => (r.type === 'visit' ? tr.exportTypeVisit : tr.exportTypeBooking) },
      { label: tr.exportColStatus, value: (r) => getStatusLabel(r.status, t.reservation) },
      { label: tr.exportColPrice, value: (r) => r.price_usd ?? r.price ?? '' },
      { label: tr.exportColNotes, value: (r) => r.notes },
    ])
    downloadCsv(`reservas-${currentBusiness?.slug || 'negocio'}-${range}.csv`, csv)
  }

  const demandConfig = { count: { label: tr.kpiReservations, color: 'var(--chart-1)' } } satisfies ChartConfig
  const hoursConfig = { count: { label: tr.kpiReservations, color: 'var(--chart-2)' } } satisfies ChartConfig
  const servicesConfig = { count: { label: tr.kpiReservations, color: 'var(--chart-3)' } } satisfies ChartConfig
  const revenueConfig = { revenue: { label: tr.kpiRevenue, color: 'var(--chart-4)' } } satisfies ChartConfig

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  if (currentBusiness?.role === 'sales') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Building2 className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">{tr.accessRestricted}</h2>
        <p className="mt-2 text-muted-foreground">{tr.accessRestrictedDesc}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-20 sm:space-y-6 lg:pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">{tr.title}</h1>
          <p className="text-sm text-muted-foreground">{tr.subtitle}</p>
        </div>
        <Select value={range} onValueChange={(value) => setRange(value as DateRangeOption)}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">{tr.range7d}</SelectItem>
            <SelectItem value="30d">{tr.range30d}</SelectItem>
            <SelectItem value="90d">{tr.range90d}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <PremiumFeature featureName={tr.premiumTitle}>
        <div className="space-y-4 sm:space-y-6">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="gap-2" onClick={handleExportReservations}>
              <Download className="h-4 w-4" />
              {tr.exportReservations}
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  {tr.kpiReservations}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-bold">{totalReservations}</div>
                  <TrendBadge trend={reservationsTrend} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  {tr.kpiRevenue}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-bold">{currencySymbol} {totalRevenue.toFixed(0)}</div>
                  <TrendBadge trend={revenueTrend} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Gauge className="h-4 w-4 text-muted-foreground" />
                  {tr.kpiOccupancy}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-bold">{occupancy.rate}%</div>
                  <TrendBadge trend={occupancyTrend} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {occupancy.bookedHours} {tr.hoursBookedOf} {occupancy.openHours} {tr.hoursUnit}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Trophy className="h-4 w-4 text-muted-foreground" />
                  {tr.kpiTopService}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="truncate text-lg font-semibold">{topService?.name ?? '—'}</div>
                {topService && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {topService.count} {tr.reservationsUnit}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <UserX className="h-4 w-4 text-muted-foreground" />
                  {tr.kpiNoShowRate}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-bold">{noShowRate.rate}%</div>
                  <TrendBadge trend={noShowTrend} invert />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {noShowRate.noShows} {tr.hoursBookedOf} {noShowRate.total} {tr.reservationsUnit}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  {tr.kpiVisits}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-bold">{visitsCount}</div>
                  <TrendBadge trend={visitsTrend} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{tr.kpiVisitsDesc}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  {tr.kpiAverageTicket}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-bold">{currencySymbol} {averageTicket.toFixed(0)}</div>
                  <TrendBadge trend={averageTicketTrend} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                  {tr.kpiCancellationRate}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-bold">{cancellationRate.rate}%</div>
                  <TrendBadge trend={cancellationTrend} invert />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {cancellationRate.cancelled} {tr.hoursBookedOf} {cancellationRate.total} {tr.reservationsUnit}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  {tr.kpiClientRetention}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{clientRetention.retentionRate}%</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {clientRetention.newClients} {tr.newClientsUnit} · {clientRetention.returningClients} {tr.returningClientsUnit}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{tr.demandTitle}</CardTitle>
              <CardDescription>{tr.demandDesc}</CardDescription>
            </CardHeader>
            <CardContent>
              {totalReservations === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">{tr.noData}</p>
              ) : (
                <ChartContainer config={demandConfig} className="h-[250px] w-full">
                  <AreaChart data={dailyDemand}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                    <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      dataKey="count"
                      type="monotone"
                      fill="var(--color-count)"
                      fillOpacity={0.2}
                      stroke="var(--color-count)"
                    />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{tr.peakHoursTitle}</CardTitle>
                <CardDescription>{tr.peakHoursDesc}</CardDescription>
              </CardHeader>
              <CardContent>
                {totalReservations === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">{tr.noData}</p>
                ) : (
                  <ChartContainer config={hoursConfig} className="h-[220px] w-full">
                    <BarChart data={hourlyDemand}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} interval={2} tickMargin={8} />
                      <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{tr.topServicesTitle}</CardTitle>
                <CardDescription>{tr.topServicesDesc}</CardDescription>
              </CardHeader>
              <CardContent>
                {serviceBreakdown.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">{tr.noData}</p>
                ) : (
                  <ChartContainer config={servicesConfig} className="h-[220px] w-full">
                    <BarChart data={serviceBreakdown.slice(0, 6)} layout="vertical" margin={{ left: 8 }}>
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        tickLine={false}
                        axisLine={false}
                        width={100}
                        tick={{ fontSize: 12 }}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{tr.revenueByServiceTitle}</CardTitle>
              <CardDescription>{tr.revenueByServiceDesc}</CardDescription>
            </CardHeader>
            <CardContent>
              {totalRevenue === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">{tr.noData}</p>
              ) : (
                <ChartContainer config={revenueConfig} className="h-[250px] w-full">
                  <BarChart data={revenueByService.slice(0, 8)}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} width={40} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{tr.topClientsTitle}</CardTitle>
              <CardDescription>{tr.topClientsDesc}</CardDescription>
            </CardHeader>
            <CardContent>
              {topClients.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">{tr.noData}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tr.topClientsColClient}</TableHead>
                      <TableHead className="text-right">{tr.topClientsColCount}</TableHead>
                      <TableHead className="text-right">{tr.topClientsColRevenue}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topClients.map((c) => (
                      <TableRow key={c.clientId}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right">{c.count}</TableCell>
                        <TableCell className="text-right">{currencySymbol} {c.revenue.toFixed(0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </PremiumFeature>
    </div>
  )
}
