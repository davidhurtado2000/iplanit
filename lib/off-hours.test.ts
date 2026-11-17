import { describe, expect, it } from 'vitest'
import { offHoursFor, type HoursRow } from './off-hours'

const day = (day_of_week: number, open: string, close: string, extra: Partial<HoursRow> = {}): HoursRow => ({
  day_of_week, open_time: open, close_time: close, is_closed: false, ...extra,
})
// 2026-11-16 is a Monday (dow 1), 2026-11-15 a Sunday (dow 0).
const monday = '2026-11-16'
const sunday = '2026-11-15'
const business = [day(1, '11:00:00', '19:00:00'), day(0, '11:00:00', '19:00:00', { is_closed: true })]

describe('offHoursFor', () => {
  it('is normal inside the schedule', () => {
    expect(offHoursFor({ dateStr: monday, timeStr: '15:00', workerHours: [], businessHours: business })).toMatchObject({ off: false, reason: 'inside', open: '11:00', close: '19:00' })
  })

  it('is off hours when the cut starts at or after closing time', () => {
    expect(offHoursFor({ dateStr: monday, timeStr: '19:00', workerHours: [], businessHours: business })?.off).toBe(true)
    expect(offHoursFor({ dateStr: monday, timeStr: '20:30', workerHours: [], businessHours: business })?.off).toBe(true)
  })

  it('is off hours before opening', () => {
    expect(offHoursFor({ dateStr: monday, timeStr: '10:30', workerHours: [], businessHours: business })?.off).toBe(true)
  })

  it('does not penalize a cut that starts before closing but ends after', () => {
    expect(offHoursFor({ dateStr: monday, timeStr: '18:30', workerHours: [], businessHours: business })?.off).toBe(false)
  })

  it('counts a day the business is closed as off hours', () => {
    expect(offHoursFor({ dateStr: sunday, timeStr: '12:00', workerHours: [], businessHours: business })).toMatchObject({ off: true, reason: 'day_off' })
  })

  it("uses the worker's own schedule over the business hours", () => {
    const worker = [day(1, '14:00:00', '22:00:00')]
    expect(offHoursFor({ dateStr: monday, timeStr: '12:00', workerHours: worker, businessHours: business })?.off).toBe(true)
    expect(offHoursFor({ dateStr: monday, timeStr: '21:00', workerHours: worker, businessHours: business })?.off).toBe(false)
  })

  it("counts a weekday missing from the worker's schedule as a day off", () => {
    const worker = [day(2, '11:00:00', '19:00:00')]
    expect(offHoursFor({ dateStr: monday, timeStr: '12:00', workerHours: worker, businessHours: business })).toMatchObject({ off: true, reason: 'day_off' })
  })

  it('honors alternating weeks (Semanas A/B)', () => {
    // 2026-11-15 (Sunday) belongs to week parity 0 or 1; the other group is off.
    const a = [day(0, '11:00:00', '19:00:00', { week_rotation: 0 })]
    const b = [day(0, '11:00:00', '19:00:00', { week_rotation: 1 })]
    const resA = offHoursFor({ dateStr: sunday, timeStr: '12:00', workerHours: a, businessHours: [] })
    const resB = offHoursFor({ dateStr: sunday, timeStr: '12:00', workerHours: b, businessHours: [] })
    expect([resA?.off, resB?.off].sort()).toEqual([false, true])
  })

  it("can't tell when no hours are configured at all", () => {
    expect(offHoursFor({ dateStr: monday, timeStr: '12:00', workerHours: [], businessHours: [] })).toBeNull()
  })

  it('with last_slot_at_close, starting exactly at closing is normal and one minute later is not', () => {
    const base = { dateStr: monday, workerHours: [], businessHours: business, lastSlotAtClose: true }
    expect(offHoursFor({ ...base, timeStr: '19:00' })?.off).toBe(false)
    expect(offHoursFor({ ...base, timeStr: '19:02' })?.off).toBe(true)
  })
})
