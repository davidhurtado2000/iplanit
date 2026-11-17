import { describe, expect, it } from 'vitest'
import { generateAvailableSlots, type BusinessHourRow } from './availability'

// 2026-12-14 is a Monday (day_of_week 1). 'UTC' keeps the maths plain.
const DATE = '2026-12-14'
const hours: BusinessHourRow[] = [{ day_of_week: 1, open_time: '10:00', close_time: '19:00', is_closed: false }]
const last = (slots: Date[]) => slots[slots.length - 1].toISOString().slice(11, 16)

describe('generateAvailableSlots - last slot', () => {
  it('by default the appointment has to end by closing time', () => {
    const slots = generateAvailableSlots(DATE, hours, 45, [], 'UTC', 0, 0, true)
    expect(last(slots)).toBe('18:00') // 18:00 + 45 min = 18:45; 18:30 would end at 19:15
  })

  it('with lastSlotAtClose the closing time itself is the last start', () => {
    const slots = generateAvailableSlots(DATE, hours, 45, [], 'UTC', 0, 0, true, true)
    expect(last(slots)).toBe('19:00')
  })

  it('never offers a start after closing time', () => {
    const slots = generateAvailableSlots(DATE, hours, 120, [], 'UTC', 0, 0, true, true)
    expect(slots.some((s) => s.toISOString().slice(11, 16) > '19:00')).toBe(false)
  })

  it('still skips times that overlap another booking', () => {
    const busy = [{ start_time: `${DATE}T18:30:00Z`, end_time: `${DATE}T19:30:00Z` }]
    const slots = generateAvailableSlots(DATE, hours, 45, busy, 'UTC', 0, 0, true, true)
    expect(last(slots)).toBe('17:30') // 18:00 would run into the 18:30 booking
  })
})
