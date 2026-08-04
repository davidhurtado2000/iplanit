'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { PremiumFeature } from '@/components/premium-feature'
import { HeroKpiCard } from '@/components/dashboard/hero-kpi-card'
import { Button } from '@/components/ui/button'
import { CalendarDays, DollarSign, Gauge, Users, Building2, Download, ArrowUp, ArrowDown } from 'lucide-react'
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
  getResourceBreakdown,
  type DateRangeOption,
  type TrendResult,
} from '@/lib/analytics'

/** Small colored delta pill next to a KPI's headline number - hidden while there's no previous-period baseline to compare against. `invert` flips the color logic for KPIs where going up is bad (no-show/cancellation rate). */
function TrendBadge({ trend, invert = false }: { trend: TrendResult; invert?: boolean }) {
  if (trend.changePct === null) return null
  if (trend.changePct === 0) {
    return (
      <Badge variant="outline" className="border-transparent bg-muted font-medium text-muted-foreground">
        0%
      </Badge>
    )
  }
  const isIncrease = trend.changePct > 0
  const isGood = invert ? !isIncrease : isIncrease
  const Icon = isIncrease ? ArrowUp : ArrowDown
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-transparent font-medium',
        isGood
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
          : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400'
      )}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(trend.changePct)}%
    </Badge>
  )
}

/** One entry in the secondary-stats strip - diagnostic numbers worth showing but that don't need hero-card weight. Several sit side by side inside one Card, divided by a border instead of each getting its own box. */
function MiniStat({
  label,
  value,
  trend,
  invertTrend,
  caption,
}: {
  label: string
  value: ReactNode
  trend?: TrendResult
  invertTrend?: boolean
  caption?: ReactNode
}) {
  return (
    <div className="sm:px-4 sm:first:pl-0 sm:last:pr-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="truncate text-xl font-semibold">{value}</span>
        {trend && <TrendBadge trend={trend} invert={invertTrend} />}
      </div>
      {caption && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{caption}</p>}
    </div>
  )
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{children}</h2>
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
  // "all" is a sentinel, not a real id - Radix Select can't use an empty
  // string as an item value (see the same convention in reservation-modal's
  // resource picker).
  const [serviceFilter, setServiceFilter] = useState('all')
  const [resourceFilter, setResourceFilter] = useState('all')

  const timezone = currentBusiness?.timezone || 'America/Lima'
  const currencySymbol = currentBusiness?.currency === 'USD' ? '$' : 'S/'
  const loading = businessLoading || dataLoading

  // Parking spots are never a reservation's resource_id (see the same
  // exclusion in reservation-modal.tsx) - listing them here would be a
  // filter option that can never match anything.
  const filterableResources = useMemo(() => resources.filter((r) => r.type !== 'parking'), [resources])

  // Every metric on this page reads from this instead of the raw
  // `reservations` list, so the service/resource filters apply consistently
  // everywhere at once (charts, KPIs, trends, and the CSV export) rather
  // than needing to be threaded through each computation individually.
  const filteredReservations = useMemo(
    () =>
      reservations.filter(
        (r) =>
          (serviceFilter === 'all' || r.service_id === serviceFilter) &&
          (resourceFilter === 'all' || r.resource_id === resourceFilter)
      ),
    [reservations, serviceFilter, resourceFilter]
  )

  const { from, to } = useMemo(() => getRangeBounds(range), [range])
  // "vs. previous period" needs data older than what's loaded by default
  // (dashboard-data-context only keeps ±90 days), and now that the range
  // picker also supports "this year"/"all time", the CURRENT period alone
  // can extend past that default window too - this is the one place that
  // on-demand expansion exists for. prevFrom..to already covers both
  // periods in one call since they're contiguous, except "all time" - its
  // "previous period" would be an equally huge, always-empty span before
  // 2020, not worth fetching (and a missing baseline just hides the trend
  // badge instead of showing something misleading, see computeTrend).
  const { from: prevFrom, to: prevTo } = useMemo(() => getPreviousRangeBounds(from, to), [from, to])
  useEffect(() => {
    if (range === 'all') {
      ensureReservationsInRange(from, to)
    } else {
      ensureReservationsInRange(prevFrom, to)
    }
  }, [range, from, to, prevFrom, ensureReservationsInRange])

  const dailyDemand = useMemo(
    () => getDailyDemand(filteredReservations, from, to, timezone, locale),
    [filteredReservations, from, to, timezone, locale]
  )
  const hourlyDemand = useMemo(
    () => getHourlyDemand(filteredReservations, from, to, timezone),
    [filteredReservations, from, to, timezone]
  )
  const serviceBreakdown = useMemo(
    () => getServiceBreakdown(filteredReservations, services, from, to),
    [filteredReservations, services, from, to]
  )
  const revenueByService = useMemo(
    () => [...serviceBreakdown].sort((a, b) => b.revenue - a.revenue),
    [serviceBreakdown]
  )
  const totalRevenue = useMemo(() => getTotalRevenue(serviceBreakdown), [serviceBreakdown])
  const occupancy = useMemo(
    () => getOccupancy(filteredReservations, businessHours, from, to, timezone),
    [filteredReservations, businessHours, from, to, timezone]
  )
  const noShowRate = useMemo(
    () => getNoShowRate(filteredReservations, from, to),
    [filteredReservations, from, to]
  )
  const visitsCount = useMemo(
    () => getVisitsCount(filteredReservations, from, to),
    [filteredReservations, from, to]
  )
  const totalReservations = useMemo(
    () => serviceBreakdown.reduce((sum, s) => sum + s.count, 0),
    [serviceBreakdown]
  )
  const topService = serviceBreakdown[0]
  const cancellationRate = useMemo(
    () => getCancellationRate(filteredReservations, from, to),
    [filteredReservations, from, to]
  )
  const averageTicket = useMemo(
    () => getAverageTicket(filteredReservations, from, to),
    [filteredReservations, from, to]
  )
  const clientRetention = useMemo(
    () => getClientRetention(filteredReservations, clients, from, to),
    [filteredReservations, clients, from, to]
  )
  const topClients = useMemo(
    () => getTopClients(filteredReservations, clients, from, to),
    [filteredReservations, clients, from, to]
  )
  const resourceBreakdown = useMemo(
    () => getResourceBreakdown(filteredReservations, filterableResources, from, to),
    [filteredReservations, filterableResources, from, to]
  )

  // Previous-period equivalents, purely to compute the trend badges below -
  // none of these are rendered on their own.
  const prevServiceBreakdown = useMemo(
    () => getServiceBreakdown(filteredReservations, services, prevFrom, prevTo),
    [filteredReservations, services, prevFrom, prevTo]
  )
  const prevTotalReservations = useMemo(
    () => prevServiceBreakdown.reduce((sum, s) => sum + s.count, 0),
    [prevServiceBreakdown]
  )
  const prevTotalRevenue = useMemo(() => getTotalRevenue(prevServiceBreakdown), [prevServiceBreakdown])
  const prevOccupancy = useMemo(
    () => getOccupancy(filteredReservations, businessHours, prevFrom, prevTo, timezone),
    [filteredReservations, businessHours, prevFrom, prevTo, timezone]
  )
  const prevNoShowRate = useMemo(
    () => getNoShowRate(filteredReservations, prevFrom, prevTo),
    [filteredReservations, prevFrom, prevTo]
  )
  const prevVisitsCount = useMemo(
    () => getVisitsCount(filteredReservations, prevFrom, prevTo),
    [filteredReservations, prevFrom, prevTo]
  )
  const prevCancellationRate = useMemo(
    () => getCancellationRate(filteredReservations, prevFrom, prevTo),
    [filteredReservations, prevFrom, prevTo]
  )
  const prevAverageTicket = useMemo(
    () => getAverageTicket(filteredReservations, prevFrom, prevTo),
    [filteredReservations, prevFrom, prevTo]
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
  // subset that would look like data went missing. Still respects the
  // service/resource filters though - exporting "everyone" while the
  // dashboard above is scoped to one staff member would be a confusing
  // mismatch between what's on screen and what's in the file.
  const handleExportReservations = () => {
    const inRange = filteredReservations.filter((r) => {
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
        <div className="flex flex-wrap items-center gap-2">
          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger className="w-[calc(50%-4px)] sm:w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr.filterAllServices}</SelectItem>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={resourceFilter} onValueChange={setResourceFilter}>
            <SelectTrigger className="w-[calc(50%-4px)] sm:w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr.filterAllResources}</SelectItem>
              {filterableResources.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={(value) => setRange(value as DateRangeOption)}>
            <SelectTrigger className="w-full sm:w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">{tr.range7d}</SelectItem>
              <SelectItem value="30d">{tr.range30d}</SelectItem>
              <SelectItem value="90d">{tr.range90d}</SelectItem>
              <SelectItem value="ytd">{tr.rangeYtd}</SelectItem>
              <SelectItem value="all">{tr.rangeAll}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <PremiumFeature featureName={tr.premiumTitle}>
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <SectionHeading>{tr.sectionOverview}</SectionHeading>
              <Button variant="ghost" size="sm" className="-mr-2 gap-2 text-muted-foreground" onClick={handleExportReservations}>
                <Download className="h-4 w-4" />
                {tr.exportReservations}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <HeroKpiCard
                label={tr.kpiRevenue}
                icon={DollarSign}
                iconClassName="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                value={`${currencySymbol} ${totalRevenue.toFixed(0)}`}
                trend={<TrendBadge trend={revenueTrend} />}
              />
              <HeroKpiCard
                label={tr.kpiReservations}
                icon={CalendarDays}
                iconClassName="bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
                value={totalReservations}
                trend={<TrendBadge trend={reservationsTrend} />}
              />
              <HeroKpiCard
                label={tr.kpiOccupancy}
                icon={Gauge}
                iconClassName="bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400"
                value={`${occupancy.rate}%`}
                trend={<TrendBadge trend={occupancyTrend} />}
                caption={`${occupancy.bookedHours} ${tr.hoursBookedOf} ${occupancy.openHours} ${tr.hoursUnit}`}
              />
              <HeroKpiCard
                label={tr.kpiClientRetention}
                icon={Users}
                iconClassName="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                value={`${clientRetention.retentionRate}%`}
                caption={`${clientRetention.newClients} ${tr.newClientsUnit} · ${clientRetention.returningClients} ${tr.returningClientsUnit}`}
              />
            </div>

            <Card>
              <CardContent className="grid grid-cols-2 gap-x-4 gap-y-4 p-4 sm:grid-cols-5 sm:gap-y-0 sm:divide-x">
                <MiniStat
                  label={tr.kpiTopService}
                  value={topService?.name ?? '—'}
                  caption={topService ? `${topService.count} ${tr.reservationsUnit}` : undefined}
                />
                <MiniStat
                  label={tr.kpiAverageTicket}
                  value={`${currencySymbol} ${averageTicket.toFixed(0)}`}
                  trend={averageTicketTrend}
                />
                <MiniStat label={tr.kpiNoShowRate} value={`${noShowRate.rate}%`} trend={noShowTrend} invertTrend />
                <MiniStat
                  label={tr.kpiCancellationRate}
                  value={`${cancellationRate.rate}%`}
                  trend={cancellationTrend}
                  invertTrend
                />
                <MiniStat label={tr.kpiVisits} value={visitsCount} trend={visitsTrend} />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <SectionHeading>{tr.sectionDemand}</SectionHeading>
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
          </div>

          <div className="space-y-4">
            <SectionHeading>{tr.sectionServices}</SectionHeading>
            <div className="grid gap-4 lg:grid-cols-2">
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

              <Card>
                <CardHeader>
                  <CardTitle>{tr.revenueByServiceTitle}</CardTitle>
                  <CardDescription>{tr.revenueByServiceDesc}</CardDescription>
                </CardHeader>
                <CardContent>
                  {totalRevenue === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">{tr.noData}</p>
                  ) : (
                    <ChartContainer config={revenueConfig} className="h-[220px] w-full">
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
            </div>
          </div>

          <div className="space-y-4">
            <SectionHeading>{tr.sectionClients}</SectionHeading>
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

          {filterableResources.length > 0 && (
            <div className="space-y-4">
              <SectionHeading>{tr.sectionResources}</SectionHeading>
              <Card>
                <CardHeader>
                  <CardTitle>{tr.resourceBreakdownTitle}</CardTitle>
                  <CardDescription>{tr.resourceBreakdownDesc}</CardDescription>
                </CardHeader>
                <CardContent>
                  {resourceBreakdown.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">{tr.noData}</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{tr.resourceBreakdownColResource}</TableHead>
                          <TableHead className="text-right">{tr.resourceBreakdownColCount}</TableHead>
                          <TableHead className="text-right">{tr.resourceBreakdownColHours}</TableHead>
                          <TableHead className="text-right">{tr.resourceBreakdownColRevenue}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {resourceBreakdown.map((r) => (
                          <TableRow key={r.resourceId}>
                            <TableCell className="font-medium">{r.name}</TableCell>
                            <TableCell className="text-right">{r.count}</TableCell>
                            <TableCell className="text-right">{r.bookedHours}</TableCell>
                            <TableCell className="text-right">{currencySymbol} {r.revenue.toFixed(0)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </PremiumFeature>
    </div>
  )
}
