// "Fuera de horario" = the appointment STARTS outside the worker's own
// schedule (Trabajadores -> horario, with Semanas A/B), or the worker doesn't
// work that day. A worker without a custom schedule follows the business
// hours. A cut that starts before closing time is normal even if it ends
// later. The database decides it for real (public.reservation_is_off_hours,
// scripts/116) - this mirror only lets the form explain it before saving, so
// keep both in sync.

import { weekParity } from '@/lib/availability'

export interface HoursRow {
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: boolean
  week_rotation?: number | null
}

export interface OffHoursResult {
  off: boolean
  /** 'day_off': doesn't work that day. 'outside' / 'inside': start time vs the day's hours. */
  reason: 'day_off' | 'outside' | 'inside'
  /** HH:MM, when the day has hours. */
  open?: string
  close?: string
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/**
 * @param dateStr  'YYYY-MM-DD' in the business timezone
 * @param timeStr  'HH:MM' start time in the business timezone
 * @returns null when the rule can't apply (no worker or no hours configured at all)
 */
export function offHoursFor(opts: {
  dateStr: string
  timeStr: string
  workerHours: HoursRow[]
  businessHours: HoursRow[]
  /** businesses.last_slot_at_close: starting exactly at closing time still
   * counts as normal hours (the last client starts then). */
  lastSlotAtClose?: boolean
}): OffHoursResult | null {
  const { dateStr, timeStr, workerHours, businessHours, lastSlotAtClose = false } = opts
  // A calendar date has no timezone of its own: read its weekday in UTC.
  const dow = new Date(`${dateStr}T12:00:00Z`).getUTCDay()

  let row: HoursRow | undefined
  if (workerHours.length > 0) {
    const parity = weekParity(dateStr)
    const candidates = workerHours.filter(
      (h) => h.day_of_week === dow && (h.week_rotation == null || h.week_rotation === parity)
    )
    // A rotation-specific row wins over an every-week one, like the SQL.
    row = candidates.find((h) => h.week_rotation != null) ?? candidates[0]
    if (!row) return { off: true, reason: 'day_off' }
  } else {
    if (businessHours.length === 0) return null
    row = businessHours.find((h) => h.day_of_week === dow)
    if (!row) return { off: true, reason: 'day_off' }
  }

  const open = row.open_time.slice(0, 5)
  const close = row.close_time.slice(0, 5)
  if (row.is_closed) return { off: true, reason: 'day_off' }
  const start = toMinutes(timeStr)
  const off = start < toMinutes(open) || (lastSlotAtClose ? start > toMinutes(close) : start >= toMinutes(close))
  return { off, reason: off ? 'outside' : 'inside', open, close }
}
