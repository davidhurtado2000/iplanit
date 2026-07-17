'use client'

import { useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { PremiumFeature } from '@/components/premium-feature'
import { CalendarDays, DollarSign, Gauge, Trophy } from 'lucide-react'
import { useBusinesses } from '@/hooks/use-businesses'
import { useDashboardData } from '@/context/dashboard-data-context'
import { useLanguage } from '@/context/language-context'
import {
  getRangeBounds,
  getDailyDemand,
  getHourlyDemand,
  getServiceBreakdown,
  getTotalRevenue,
  getOccupancy,
  type DateRangeOption,
} from '@/lib/analytics'

export default function AnalyticsPage() {
  const { businesses, loading: businessLoading } = useBusinesses()
  const { reservations, services, businessHours, loading: dataLoading } = useDashboardData()
  const { t, locale } = useLanguage()
  const tr = t.analytics
  const [range, setRange] = useState<DateRangeOption>('30d')

  const currentBusiness = businesses?.[0]
  const timezone = currentBusiness?.timezone || 'America/Lima'
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
  const totalReservations = useMemo(
    () => serviceBreakdown.reduce((sum, s) => sum + s.count, 0),
    [serviceBreakdown]
  )
  const topService = serviceBreakdown[0]

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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                <div className="text-3xl font-bold">S/ {totalRevenue.toFixed(0)}</div>
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
