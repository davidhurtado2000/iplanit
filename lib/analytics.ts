import type { Reservation, Service, BusinessHour } from '@/context/dashboard-data-context'

export type DateRangeOption = '7d' | '30d' | '90d'

const DAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const DAY_MS = 24 * 60 * 60 * 1000

export function getRangeBounds(option: DateRangeOption): { from: Date; to: Date } {
  const to = new Date()
  const days = option === '7d' ? 7 : option === '30d' ? 30 : 90
  const from = new Date(to.getTime() - (days - 1) * DAY_MS)
  return { from, to }
}

function isCountable(reservation: Reservation) {
  return reservation.status !== 'cancelled'
}

function isInRange(reservation: Reservation, from: Date, to: Date) {
  const start = new Date(reservation.start_time).getTime()
  return start >= from.getTime() && start <= to.getTime()
}

export function filterReservations(reservations: Reservation[], from: Date, to: Date): Reservation[] {
  return reservations.filter((r) => isCountable(r) && isInRange(r, from, to))
}

function dayKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date)
}

function dayOfWeekInTz(date: Date, timezone: string): number {
  const short = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date)
  return DAY_MAP[short] ?? date.getUTCDay()
}

export interface DailyDemandPoint {
  date: string
  label: string
  count: number
}

/** One point per calendar day in [from, to] (business timezone), gaps filled with 0 so the chart doesn't skip days. */
export function getDailyDemand(
  reservations: Reservation[],
  from: Date,
  to: Date,
  timezone: string,
  locale: string
): DailyDemandPoint[] {
  const inRange = filterReservations(reservations, from, to)
  const counts = new Map<string, number>()
  for (const r of inRange) {
    const key = dayKey(new Date(r.start_time), timezone)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const points: DailyDemandPoint[] = []
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    const d = new Date(t)
    const key = dayKey(d, timezone)
    const label = new Intl.DateTimeFormat(locale, { timeZone: timezone, day: 'numeric', month: 'short' }).format(d)
    points.push({ date: key, label, count: counts.get(key) ?? 0 })
  }
  return points
}

export interface HourlyDemandPoint {
  hour: number
  label: string
  count: number
}

function formatHourLabel(hour: number): string {
  const period = hour < 12 ? 'a' : 'p'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}${period}`
}

/** Reservation count bucketed by hour-of-day (0-23) in the business timezone - shows peak hours. */
export function getHourlyDemand(reservations: Reservation[], from: Date, to: Date, timezone: string): HourlyDemandPoint[] {
  const inRange = filterReservations(reservations, from, to)
  const counts = new Array(24).fill(0) as number[]
  for (const r of inRange) {
    const hourStr = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(new Date(r.start_time))
    const hour = parseInt(hourStr, 10) % 24
    counts[hour] += 1
  }
  return counts.map((count, hour) => ({ hour, label: formatHourLabel(hour), count }))
}

export interface ServiceBreakdownRow {
  serviceId: string
  name: string
  count: number
  revenue: number
  color: string
}

/**
 * Reservations and revenue grouped by service, sorted by most-booked first.
 * Cancelled reservations don't count toward either. Revenue uses
 * service.price (Soles) only - price_usd is a display-only reference field
 * (enforced as required vs. optional in the service form), so there's a
 * single, unambiguous number here rather than silently mixing currencies.
 */
export function getServiceBreakdown(
  reservations: Reservation[],
  services: Service[],
  from: Date,
  to: Date
): ServiceBreakdownRow[] {
  const inRange = filterReservations(reservations, from, to)
  const byService = new Map<string, { count: number; revenue: number }>()

  for (const r of inRange) {
    const entry = byService.get(r.service_id) ?? { count: 0, revenue: 0 }
    entry.count += 1
    const service = services.find((s) => s.id === r.service_id)
    entry.revenue += service?.price ?? 0
    byService.set(r.service_id, entry)
  }

  return Array.from(byService.entries())
    .map(([serviceId, { count, revenue }]) => {
      const service = services.find((s) => s.id === serviceId)
      return {
        serviceId,
        name: service?.name ?? '—',
        count,
        revenue,
        color: service?.color || '#94a3b8',
      }
    })
    .sort((a, b) => b.count - a.count)
}

export function getTotalRevenue(breakdown: ServiceBreakdownRow[]): number {
  return breakdown.reduce((sum, row) => sum + row.revenue, 0)
}

export interface OccupancyResult {
  bookedHours: number
  openHours: number
  rate: number
}

/**
 * Booked hours vs. total open hours across the range, as a rough whole-business
 * occupancy estimate (not per-resource - the schema doesn't track per-resource
 * capacity limits, so this is the closest honest approximation).
 */
export function getOccupancy(
  reservations: Reservation[],
  businessHours: BusinessHour[],
  from: Date,
  to: Date,
  timezone: string
): OccupancyResult {
  const inRange = filterReservations(reservations, from, to)
  const bookedMs = inRange.reduce((sum, r) => {
    return sum + (new Date(r.end_time).getTime() - new Date(r.start_time).getTime())
  }, 0)
  const bookedHours = bookedMs / (1000 * 60 * 60)

  const openHoursByWeekday = new Map<number, number>()
  for (const bh of businessHours) {
    if (bh.is_closed) continue
    const [openH, openM] = bh.open_time.split(':').map(Number)
    const [closeH, closeM] = bh.close_time.split(':').map(Number)
    const hours = closeH * 60 + closeM - (openH * 60 + openM)
    openHoursByWeekday.set(bh.day_of_week, hours / 60)
  }

  let openHours = 0
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    const weekday = dayOfWeekInTz(new Date(t), timezone)
    openHours += openHoursByWeekday.get(weekday) ?? 0
  }

  const rate = openHours > 0 ? Math.min(100, Math.round((bookedHours / openHours) * 100)) : 0
  return { bookedHours: Math.round(bookedHours), openHours: Math.round(openHours), rate }
}
