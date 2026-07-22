'use client'

import { useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { PremiumFeature } from '@/components/premium-feature'
import { Button } from '@/components/ui/button'
import { CalendarDays, DollarSign, Gauge, Trophy, UserX, Building2, Eye, Download } from 'lucide-react'
import { useBusinesses } from '@/hooks/use-businesses'
import { useDashboardData } from '@/context/dashboard-data-context'
import { useLanguage } from '@/context/language-context'
import { toCsv, downloadCsv } from '@/lib/csv'
import { getStatusLabel } from '@/lib/reservation-status'
import {
  getRangeBounds,
  getDailyDemand,
  getHourlyDemand,
  getServiceBreakdown,
  getTotalRevenue,
  getOccupancy,
  getNoShowRate,
  getVisitsCount,
  type DateRangeOption,
} from '@/lib/analytics'

export default function AnalyticsPage() {
  const { currentBusiness, loading: businessLoading } = useBusinesses()
  const { reservations, clients, services, resources, businessHours, loading: dataLoading } = useDashboardData()
  const { t, locale } = useLanguage()
  const tr = t.analytics
  const [range, setRange] = useState<DateRangeOption>('30d')

  const timezone = currentBusiness?.timezone || 'America/Lima'
  const currencySymbol = currentBusiness?.currency === 'USD' ? '$' : 'S/'
  const loading = businessLoading || dataLoading

  const { from, to } = useMemo(() => getRangeBounds(range), [range])

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
                <div className="text-3xl font-bold">{totalReservations}</div>
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
                <div className="text-3xl font-bold">{currencySymbol} {totalRevenue.toFixed(0)}</div>
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
                <div className="text-3xl font-bold">{occupancy.rate}%</div>
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
                <div className="text-3xl font-bold">{noShowRate.rate}%</div>
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
                <div className="text-3xl font-bold">{visitsCount}</div>
                <p className="mt-1 text-xs text-muted-foreground">{tr.kpiVisitsDesc}</p>
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
        </div>
      </PremiumFeature>
    </div>
  )
}
