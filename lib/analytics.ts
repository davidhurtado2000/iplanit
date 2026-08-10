import type { Reservation, Service, BusinessHour, Client, Resource, Worker } from '@/context/dashboard-data-context'

export type DateRangeOption = '7d' | '30d' | '90d' | 'ytd' | 'all'

const DAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const DAY_MS = 24 * 60 * 60 * 1000

// Floor for "all time" - well before any real iPlanit business could have
// been created, so it's equivalent to "since the business existed" without
// needing to plumb businesses.created_at through just for this.
const ALL_TIME_START = new Date('2020-01-01T00:00:00Z')

export function getRangeBounds(option: DateRangeOption): { from: Date; to: Date } {
  const to = new Date()
  if (option === 'all') {
    return { from: ALL_TIME_START, to }
  }
  if (option === 'ytd') {
    return { from: new Date(to.getFullYear(), 0, 1), to }
  }
  const days = option === '7d' ? 7 : option === '30d' ? 30 : 90
  const from = new Date(to.getTime() - (days - 1) * DAY_MS)
  return { from, to }
}

/** The period of equal length immediately preceding [from, to] - what "vs. previous period" compares against. */
export function getPreviousRangeBounds(from: Date, to: Date): { from: Date; to: Date } {
  const durationMs = to.getTime() - from.getTime()
  const prevTo = new Date(from.getTime() - 1)
  const prevFrom = new Date(prevTo.getTime() - durationMs)
  return { from: prevFrom, to: prevTo }
}

export interface TrendResult {
  current: number
  previous: number
  /** null when there's no previous-period baseline to compare against (previous === 0) - a raw % would be meaningless (or infinite). */
  changePct: number | null
}

export function computeTrend(current: number, previous: number): TrendResult {
  if (previous === 0) {
    return { current, previous, changePct: current === 0 ? 0 : null }
  }
  return { current, previous, changePct: Math.round(((current - previous) / previous) * 100) }
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
 * Cancelled reservations don't count toward either. Revenue reads each
 * reservation's own price/price_usd - a snapshot of what was actually
 * charged at booking time (see reservation-modal.tsx), not a live lookup of
 * the service's current price. That snapshot is what makes flexible-
 * duration pricing and one-off quotes possible in the first place, and as
 * a side effect it also means editing a service's price later no longer
 * silently rewrites historical revenue. A business bills in a single
 * currency (businesses.currency), so price || price_usd always picks the
 * one actually in use. No-shows still count as a booking (kept in `count`,
 * for demand/popularity purposes) but never contribute revenue since
 * nothing was actually collected. Visits (type = 'visit', see
 * getVisitsCount) are excluded entirely - they're often not tied to a
 * specific service at all, and never generate revenue.
 */
export function getServiceBreakdown(
  reservations: Reservation[],
  services: Service[],
  from: Date,
  to: Date
): ServiceBreakdownRow[] {
  const inRange = filterReservations(reservations, from, to).filter((r) => r.type !== 'visit' && r.service_id)
  const byService = new Map<string, { count: number; revenue: number }>()

  for (const r of inRange) {
    const serviceId = r.service_id as string
    const entry = byService.get(serviceId) ?? { count: 0, revenue: 0 }
    entry.count += 1
    if (r.status !== 'no_show') {
      entry.revenue += (r.price || r.price_usd) ?? 0
    }
    byService.set(serviceId, entry)
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

export interface NoShowRateResult {
  noShows: number
  total: number
  rate: number
}

/** Share of non-cancelled reservations that ended up as a no-show, in the given range. */
export function getNoShowRate(reservations: Reservation[], from: Date, to: Date): NoShowRateResult {
  const inRange = filterReservations(reservations, from, to)
  const noShows = inRange.filter((r) => r.status === 'no_show').length
  const total = inRange.length
  const rate = total > 0 ? Math.round((noShows / total) * 100) : 0
  return { noShows, total, rate }
}

/**
 * Count of showroom visits (type = 'visit') in the range, kept as its own
 * independent number rather than trying to trace which visit converted
 * into which later booking - real attribution needs a way to link the two
 * explicitly, which isn't part of this v1. Comparing this against the
 * reservations KPI is left to the business owner to eyeball.
 */
export function getVisitsCount(reservations: Reservation[], from: Date, to: Date): number {
  return filterReservations(reservations, from, to).filter((r) => r.type === 'visit').length
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

export interface CancellationRateResult {
  cancelled: number
  total: number
  rate: number
}

/**
 * Share of reservations in the range that ended up cancelled. Deliberately
 * doesn't use filterReservations/isCountable - those exclude cancelled
 * rows on purpose (for KPIs that shouldn't count them), but this metric's
 * whole point is measuring exactly that excluded slice.
 */
export function getCancellationRate(reservations: Reservation[], from: Date, to: Date): CancellationRateResult {
  const inRange = reservations.filter((r) => r.type !== 'visit' && isInRange(r, from, to))
  const cancelled = inRange.filter((r) => r.status === 'cancelled').length
  const total = inRange.length
  const rate = total > 0 ? Math.round((cancelled / total) * 100) : 0
  return { cancelled, total, rate }
}

/**
 * Average revenue per billable reservation (no-shows excluded from both the
 * sum and the count, same revenue convention as getServiceBreakdown) - a
 * cleaner "average ticket" than dividing total revenue by every booking
 * attempt, which would understate it whenever there are no-shows.
 */
export function getAverageTicket(reservations: Reservation[], from: Date, to: Date): number {
  const inRange = filterReservations(reservations, from, to).filter(
    (r) => r.type !== 'visit' && r.service_id && r.status !== 'no_show'
  )
  if (inRange.length === 0) return 0
  const revenue = inRange.reduce((sum, r) => sum + ((r.price || r.price_usd) ?? 0), 0)
  return revenue / inRange.length
}

export interface ClientRetentionResult {
  newClients: number
  returningClients: number
  /** % of this period's clients who'd already been a client before the period started. */
  retentionRate: number
}

/**
 * Classifies each client active in the period as new vs. returning using
 * clients.created_at as the proxy for "when this person first became a
 * client" (clients are created at first booking, not pre-loaded in bulk -
 * see scripts/005-create-clients.sql) rather than scanning reservation
 * history, which would be wrong for anyone whose first-ever booking falls
 * outside the ±90-day window dashboard-data-context.tsx actually loads.
 */
export function getClientRetention(
  reservations: Reservation[],
  clients: Client[],
  from: Date,
  to: Date
): ClientRetentionResult {
  const inRange = filterReservations(reservations, from, to).filter((r) => r.client_id)
  const clientIds = new Set(inRange.map((r) => r.client_id))

  let newClients = 0
  let returningClients = 0
  for (const id of clientIds) {
    const client = clients.find((c) => c.id === id)
    if (!client) continue
    const createdAt = new Date(client.created_at)
    if (createdAt >= from && createdAt <= to) newClients++
    else returningClients++
  }

  const total = newClients + returningClients
  const retentionRate = total > 0 ? Math.round((returningClients / total) * 100) : 0
  return { newClients, returningClients, retentionRate }
}

export interface TopClientRow {
  clientId: string
  name: string
  count: number
  revenue: number
}

/** Clients ranked by revenue in the period - the "who are my VIPs" list. Visits excluded, same reasoning as getServiceBreakdown. */
export function getTopClients(
  reservations: Reservation[],
  clients: Client[],
  from: Date,
  to: Date,
  limit = 5
): TopClientRow[] {
  const inRange = filterReservations(reservations, from, to).filter((r) => r.type !== 'visit' && r.client_id)
  const byClient = new Map<string, { count: number; revenue: number }>()

  for (const r of inRange) {
    const entry = byClient.get(r.client_id) ?? { count: 0, revenue: 0 }
    entry.count += 1
    if (r.status !== 'no_show') {
      entry.revenue += (r.price || r.price_usd) ?? 0
    }
    byClient.set(r.client_id, entry)
  }

  return Array.from(byClient.entries())
    .map(([clientId, { count, revenue }]) => ({
      clientId,
      name: clients.find((c) => c.id === clientId)?.name ?? '—',
      count,
      revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit)
}

export interface ResourceBreakdownRow {
  resourceId: string
  name: string
  count: number
  revenue: number
  bookedHours: number
}

/**
 * Reservations, revenue, and booked hours grouped by resource - the
 * per-staff/per-room comparison that getOccupancy can't give (it's
 * deliberately whole-business only, see its own comment: the schema has no
 * per-resource capacity/hours, so there's no honest denominator for a
 * per-resource occupancy %). Booked hours alone is still a fair stand-in for
 * "how busy was this person/room" without fabricating a rate. Reservations
 * with no resource_id (many services don't require one) are excluded, same
 * as visits.
 */
export function getResourceBreakdown(
  reservations: Reservation[],
  resources: Pick<Resource, 'id' | 'name'>[],
  from: Date,
  to: Date
): ResourceBreakdownRow[] {
  const inRange = filterReservations(reservations, from, to).filter((r) => r.type !== 'visit' && r.resource_id)
  const byResource = new Map<string, { count: number; revenue: number; bookedMs: number }>()

  for (const r of inRange) {
    const resourceId = r.resource_id as string
    const entry = byResource.get(resourceId) ?? { count: 0, revenue: 0, bookedMs: 0 }
    entry.count += 1
    entry.bookedMs += new Date(r.end_time).getTime() - new Date(r.start_time).getTime()
    if (r.status !== 'no_show') {
      entry.revenue += (r.price || r.price_usd) ?? 0
    }
    byResource.set(resourceId, entry)
  }

  return Array.from(byResource.entries())
    .map(([resourceId, { count, revenue, bookedMs }]) => ({
      resourceId,
      name: resources.find((r) => r.id === resourceId)?.name ?? '—',
      count,
      revenue,
      bookedHours: Math.round((bookedMs / (1000 * 60 * 60)) * 10) / 10,
    }))
    .sort((a, b) => b.revenue - a.revenue)
}

export interface WorkerBreakdownRow {
  workerId: string
  name: string
  count: number
  revenue: number
  bookedHours: number
  /** Of `count`, how many finished as 'completed' vs 'no_show' vs
   * 'cancelled' - the "eficiencia" view getResourceBreakdown deliberately
   * doesn't have (it's about volume/revenue, not outcomes). completionRate
   * excludes still-pending/confirmed reservations from its denominator (only
   * count of resolved ones - completed+no_show+cancelled), so it doesn't
   * dip artificially low for a worker whose upcoming bookings just haven't
   * happened yet. Null (not 0%) when there's nothing resolved yet to rate. */
  completedCount: number
  noShowCount: number
  cancelledCount: number
  completionRate: number | null
}

/**
 * Same reservations/revenue/hours breakdown as getResourceBreakdown, but
 * grouped by worker - a separate dimension (see Worker in dashboard-data-
 * context.tsx: who did the work, independent of which room/equipment was
 * used). Adds outcome rates on top, since "who's reliable" is exactly the
 * kind of per-person question a resource (a room) never needs answered.
 */
export function getWorkerBreakdown(
  reservations: Reservation[],
  workers: Pick<Worker, 'id' | 'name'>[],
  from: Date,
  to: Date
): WorkerBreakdownRow[] {
  const inRange = filterReservations(reservations, from, to).filter((r) => r.type !== 'visit' && r.worker_id)
  const byWorker = new Map<
    string,
    { count: number; revenue: number; bookedMs: number; completed: number; noShow: number; cancelled: number }
  >()

  for (const r of inRange) {
    const workerId = r.worker_id as string
    const entry = byWorker.get(workerId) ?? { count: 0, revenue: 0, bookedMs: 0, completed: 0, noShow: 0, cancelled: 0 }
    entry.count += 1
    entry.bookedMs += new Date(r.end_time).getTime() - new Date(r.start_time).getTime()
    if (r.status !== 'no_show') {
      entry.revenue += (r.price || r.price_usd) ?? 0
    }
    if (r.status === 'completed') entry.completed += 1
    else if (r.status === 'no_show') entry.noShow += 1
    else if (r.status === 'cancelled') entry.cancelled += 1
    byWorker.set(workerId, entry)
  }

  return Array.from(byWorker.entries())
    .map(([workerId, { count, revenue, bookedMs, completed, noShow, cancelled }]) => {
      const resolved = completed + noShow + cancelled
      return {
        workerId,
        name: workers.find((w) => w.id === workerId)?.name ?? '—',
        count,
        revenue,
        bookedHours: Math.round((bookedMs / (1000 * 60 * 60)) * 10) / 10,
        completedCount: completed,
        noShowCount: noShow,
        cancelledCount: cancelled,
        completionRate: resolved > 0 ? Math.round((completed / resolved) * 100) : null,
      }
    })
    .sort((a, b) => b.revenue - a.revenue)
}
