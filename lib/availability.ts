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

function toMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
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
  tz: string
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
    if (busyRanges.some((b) => slotStart < b.end && slotEnd > b.start)) continue
    slots.push(slotStart)
  }
  return slots
}
