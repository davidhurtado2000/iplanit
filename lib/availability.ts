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
