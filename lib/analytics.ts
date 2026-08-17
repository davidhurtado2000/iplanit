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

export function formatHourLabel(hour: number): string {
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

export interface RevenueOverTimePoint {
  date: string
  label: string
  revenue: number
}

/**
 * Same shape as getDailyDemand (one point per calendar day in [from, to],
 * gaps filled with 0) but summing revenue instead of counting reservations -
 * the trend chart that was missing next to the Ingresos KPI's single
 * aggregate number. Same no-show exclusion as getServiceBreakdown/
 * getTopClients (nothing was actually collected) and same visits exclusion
 * (never generate revenue).
 */
export function getRevenueOverTime(
  reservations: Reservation[],
  from: Date,
  to: Date,
  timezone: string,
  locale: string
): RevenueOverTimePoint[] {
  const inRange = filterReservations(reservations, from, to).filter(
    (r) => r.type !== 'visit' && r.status !== 'no_show'
  )
  const revenueByDay = new Map<string, number>()
  for (const r of inRange) {
    const key = dayKey(new Date(r.start_time), timezone)
    revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + ((r.price || r.price_usd) ?? 0))
  }

  const points: RevenueOverTimePoint[] = []
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    const d = new Date(t)
    const key = dayKey(d, timezone)
    const label = new Intl.DateTimeFormat(locale, { timeZone: timezone, day: 'numeric', month: 'short' }).format(d)
    points.push({ date: key, label, revenue: Math.round((revenueByDay.get(key) ?? 0) * 100) / 100 })
  }
  return points
}

export interface HeatmapCell {
  dayOfWeek: number
  hour: number
  count: number
}

/**
 * Reservation count bucketed by day-of-week x hour-of-day, in the business
 * timezone - the combination getDailyDemand (per-day, no hour breakdown)
 * and getHourlyDemand (per-hour, collapsed across every day in range) can't
 * show on their own, e.g. "Tuesdays at 3pm specifically" vs. "Tuesdays" or
 * "3pm" in isolation - the classic scheduling-optimization view. Always
 * 7*24=168 cells (dayOfWeek 0=Sun...6=Sat), gaps filled with 0 so the
 * heatmap UI can render a dense grid directly without its own gap-filling.
 */
export function getDemandHeatmap(reservations: Reservation[], from: Date, to: Date, timezone: string): HeatmapCell[] {
  const inRange = filterReservations(reservations, from, to)
  const counts = new Map<string, number>()
  for (const r of inRange) {
    const d = new Date(r.start_time)
    const dow = dayOfWeekInTz(d, timezone)
    const hourStr = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(d)
    const hour = parseInt(hourStr, 10) % 24
    const key = `${dow}-${hour}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const cells: HeatmapCell[] = []
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      cells.push({ dayOfWeek: dow, hour, count: counts.get(`${dow}-${hour}`) ?? 0 })
    }
  }
  return cells
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

export interface RevenueBySegmentResult {
  newRevenue: number
  returningRevenue: number
  newSharePct: number
  returningSharePct: number
}

/**
 * Same new-vs-returning classification as getClientRetention (clients.
 * created_at as the "became a client" proxy) but summing revenue instead of
 * counting clients - answers "how much of what I made this period came
 * from people who already knew me" rather than just "what % of my clients
 * were returning". A business with a high returning-client count but low
 * returning revenue share (e.g. lots of repeat visitors booking the
 * cheapest service) is a different situation than the retention KPI alone
 * would suggest.
 */
export function getRevenueBySegment(
  reservations: Reservation[],
  clients: Client[],
  from: Date,
  to: Date
): RevenueBySegmentResult {
  const inRange = filterReservations(reservations, from, to).filter(
    (r) => r.type !== 'visit' && r.client_id && r.status !== 'no_show'
  )

  let newRevenue = 0
  let returningRevenue = 0
  for (const r of inRange) {
    const client = clients.find((c) => c.id === r.client_id)
    if (!client) continue
    const revenue = (r.price || r.price_usd) ?? 0
    const createdAt = new Date(client.created_at)
    if (createdAt >= from && createdAt <= to) newRevenue += revenue
    else returningRevenue += revenue
  }

  const total = newRevenue + returningRevenue
  return {
    newRevenue,
    returningRevenue,
    newSharePct: total > 0 ? Math.round((newRevenue / total) * 100) : 0,
    returningSharePct: total > 0 ? Math.round((returningRevenue / total) * 100) : 0,
  }
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

export interface ClientReliabilityRow {
  clientId: string
  name: string
  totalCount: number
  noShowCount: number
  cancelledCount: number
  issueRate: number
}

/**
 * Per-client no-show/cancellation ranking - the counterpart to
 * getNoShowRate/getCancellationRate (both whole-business aggregates) that
 * names the specific clients driving those numbers, so a business owner
 * knows who to ask for a deposit or an extra confirmation call rather than
 * just seeing "12% no-show rate" with no one to act on. Excludes clients
 * with fewer than 2 total reservations in range (one missed appointment out
 * of one isn't a pattern worth flagging yet) and clients with zero issues
 * (nothing to act on). Visits excluded, same as every other per-client
 * breakdown on this page.
 */
export function getClientReliability(
  reservations: Reservation[],
  clients: Client[],
  from: Date,
  to: Date,
  limit = 10
): ClientReliabilityRow[] {
  const inRange = reservations.filter((r) => r.type !== 'visit' && r.client_id && isInRange(r, from, to))
  const byClient = new Map<string, { total: number; noShow: number; cancelled: number }>()

  for (const r of inRange) {
    const entry = byClient.get(r.client_id) ?? { total: 0, noShow: 0, cancelled: 0 }
    entry.total += 1
    if (r.status === 'no_show') entry.noShow += 1
    else if (r.status === 'cancelled') entry.cancelled += 1
    byClient.set(r.client_id, entry)
  }

  return Array.from(byClient.entries())
    .map(([clientId, { total, noShow, cancelled }]) => ({
      clientId,
      name: clients.find((c) => c.id === clientId)?.name ?? '—',
      totalCount: total,
      noShowCount: noShow,
      cancelledCount: cancelled,
      issueRate: total > 0 ? Math.round(((noShow + cancelled) / total) * 100) : 0,
    }))
    .filter((row) => row.totalCount >= 2 && row.noShowCount + row.cancelledCount > 0)
    .sort((a, b) => b.issueRate - a.issueRate || (b.noShowCount + b.cancelledCount) - (a.noShowCount + a.cancelledCount))
    .slice(0, limit)
}

export interface AtRiskClientRow {
  clientId: string
  name: string
  lastVisit: string
  daysSinceLastVisit: number
  totalVisits: number
  lifetimeRevenue: number
}

/**
 * Clients who used to book regularly and appear to have stopped, computed
 * from whatever reservation history is currently loaded rather than the
 * page's [from, to] filter - "who am I about to lose" is a question about
 * right now, not about an arbitrary report window, so unlike every other
 * function in this file it ignores the date-range picker entirely and
 * always measures against today. Same approximation caveat as getOccupancy:
 * if a client's true last visit predates what dashboard-data-context has
 * loaded, they'd be missed here (not solved here). Requires at least 2
 * lifetime reservations (a genuine repeat pattern, not a one-time visitor)
 * and a gap of 45-180 days since their last one - under 45 days isn't
 * unusual yet for most service businesses, and past 180 they've likely just
 * left for good rather than being "at risk" of leaving. Sorted by lifetime
 * revenue so the highest-value lapsed clients surface first.
 */
export function getAtRiskClients(reservations: Reservation[], clients: Client[], limit = 10): AtRiskClientRow[] {
  const relevant = reservations.filter((r) => r.type !== 'visit' && r.client_id && r.status !== 'cancelled')
  const byClient = new Map<string, { lastVisit: Date; totalVisits: number; lifetimeRevenue: number }>()

  for (const r of relevant) {
    const start = new Date(r.start_time)
    const entry = byClient.get(r.client_id) ?? { lastVisit: start, totalVisits: 0, lifetimeRevenue: 0 }
    entry.totalVisits += 1
    if (start > entry.lastVisit) entry.lastVisit = start
    if (r.status !== 'no_show') entry.lifetimeRevenue += (r.price || r.price_usd) ?? 0
    byClient.set(r.client_id, entry)
  }

  const now = Date.now()
  return Array.from(byClient.entries())
    .map(([clientId, { lastVisit, totalVisits, lifetimeRevenue }]) => ({
      clientId,
      name: clients.find((c) => c.id === clientId)?.name ?? '—',
      lastVisit: lastVisit.toISOString(),
      daysSinceLastVisit: Math.floor((now - lastVisit.getTime()) / DAY_MS),
      totalVisits,
      lifetimeRevenue,
    }))
    .filter((row) => row.totalVisits >= 2 && row.daysSinceLastVisit >= 45 && row.daysSinceLastVisit <= 180)
    .sort((a, b) => b.lifetimeRevenue - a.lifetimeRevenue)
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

export interface SellerBreakdownRow {
  sellerId: string
  name: string
  count: number
  revenue: number
}

/**
 * Reservations grouped by who booked/sold them (sold_by - see
 * scripts/059-reservation-sold-by.sql), not who performs the service
 * (worker_id, see getWorkerBreakdown above). Deliberately simpler than the
 * worker breakdown (no hours/completion-rate) - a seller's performance is
 * about volume and revenue booked, not about how the appointment itself
 * played out, which is the performing worker's outcome to own. `sellerNames`
 * is a plain id->name lookup rather than a typed entity list (unlike
 * workers) because "sellers" aren't a table of their own - they're
 * whichever staff user happened to be logged in at booking time, resolved
 * by the caller from business_members + the business owner.
 */
export function getSellerBreakdown(
  reservations: Reservation[],
  sellerNames: Record<string, string>,
  from: Date,
  to: Date
): SellerBreakdownRow[] {
  const inRange = filterReservations(reservations, from, to).filter((r) => r.type !== 'visit' && r.sold_by)
  const bySeller = new Map<string, { count: number; revenue: number }>()

  for (const r of inRange) {
    const sellerId = r.sold_by as string
    const entry = bySeller.get(sellerId) ?? { count: 0, revenue: 0 }
    entry.count += 1
    if (r.status !== 'no_show') {
      entry.revenue += (r.price || r.price_usd) ?? 0
    }
    bySeller.set(sellerId, entry)
  }

  return Array.from(bySeller.entries())
    .map(([sellerId, { count, revenue }]) => ({
      sellerId,
      name: sellerNames[sellerId] ?? '—',
      count,
      revenue,
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
