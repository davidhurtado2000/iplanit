import { parseInTimezone, getTzDayOfWeek } from '@/lib/timezone'

export interface BusinessHourRow {
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: boolean
}

export interface BusyRange {
  start_time: string
  end_time: string
}

export const SLOT_INTERVAL_MINUTES = 30

/**
 * True when the business doesn't open at all on this date's day of week -
 * lets the UI tell "cerrado este dia" apart from "abierto pero todo
 * ocupado", which generateAvailableSlots' empty array alone can't do. Same
 * permissive fallback as generateAvailableSlots when hours aren't
 * configured yet (never "closed" in that case).
 */
export function isDayClosed(dateStr: string, hours: BusinessHourRow[], tz: string): boolean {
  if (hours.length === 0) return false
  const dayOfWeek = getTzDayOfWeek(dateStr, tz)
  const bh = hours.find((h) => h.day_of_week === dayOfWeek)
  return !bh || bh.is_closed
}

function toMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/**
 * This date's open/close time (in minutes from midnight), or null when the
 * business is closed that day or hours aren't configured yet - lets the
 * calendar grid (calendar-view.tsx) shade hours outside the business's own
 * range instead of only ever showing the same fixed week-wide start/end
 * regardless of which day is open how late.
 */
export function getDayHoursRange(
  dateStr: string,
  hours: BusinessHourRow[],
  tz: string
): { openMinutes: number; closeMinutes: number } | null {
  if (hours.length === 0) return null
  const dayOfWeek = getTzDayOfWeek(dateStr, tz)
  const bh = hours.find((h) => h.day_of_week === dayOfWeek)
  if (!bh || bh.is_closed) return null
  return { openMinutes: toMinutes(bh.open_time), closeMinutes: toMinutes(bh.close_time) }
}

/**
 * Available start times for a single day, given business hours and existing
 * bookings - shared by the public booking page and the internal reservation
 * modal's date/time picker so the two never drift apart on what counts as
 * "available".
 */
export function generateAvailableSlots(
  dateStr: string,
  hours: BusinessHourRow[],
  durationMinutes: number,
  busy: BusyRange[],
  tz: string,
  bufferBeforeMin = 0,
  bufferAfterMin = 0
): Date[] {
  if (durationMinutes <= 0) return []

  const dayOfWeek = getTzDayOfWeek(dateStr, tz)
  const bh = hours.find((h) => h.day_of_week === dayOfWeek)

  let openMinutes: number
  let closeMinutes: number
  if (hours.length === 0) {
    // Owner hasn't configured business hours yet - default to a permissive
    // range instead of looking fully booked to every visitor/staff member.
    openMinutes = 7 * 60
    closeMinutes = 21 * 60
  } else {
    if (!bh || bh.is_closed) return []
    openMinutes = toMinutes(bh.open_time)
    closeMinutes = toMinutes(bh.close_time)
  }

  const busyRanges = busy.map((b) => ({ start: new Date(b.start_time), end: new Date(b.end_time) }))
  const now = new Date()
  const slots: Date[] = []

  for (let m = openMinutes; m + durationMinutes <= closeMinutes; m += SLOT_INTERVAL_MINUTES) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0')
    const mm = String(m % 60).padStart(2, '0')
    const slotStart = parseInTimezone(`${dateStr}T${hh}:${mm}`, tz)
    const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000)
    if (slotStart < now) continue
    // Busy ranges are expanded by each EXISTING reservation's own buffer
    // before they get here - expanding this candidate by its OWN buffer too
    // makes the check bidirectional, so a service with no buffer still can't
    // be booked inside someone else's cleanup window, and a service that
    // needs its own cleanup won't get scheduled right up against the next
    // appointment either.
    const checkStart = new Date(slotStart.getTime() - bufferBeforeMin * 60000)
    const checkEnd = new Date(slotEnd.getTime() + bufferAfterMin * 60000)
    if (busyRanges.some((b) => checkStart < b.end && checkEnd > b.start)) continue
    slots.push(slotStart)
  }
  return slots
}

/**
 * Slots available in BOTH sets - used to combine business-wide hours with a
 * specific resource's own work schedule (scripts/057-staff-schedules.sql),
 * so a client/staff member can't book a person outside either the
 * business's general hours or that person's individual ones. Both inputs
 * come from generateAvailableSlots on the same date/interval grid, so a
 * plain timestamp-set intersection is exact - no fuzzy matching needed.
 */
export function intersectSlots(a: Date[], b: Date[]): Date[] {
  const bTimes = new Set(b.map((d) => d.getTime()))
  return a.filter((d) => bTimes.has(d.getTime()))
}
