import { describe, expect, it } from 'vitest'
import { layoutDay, minutesOfDay, monthGrid, timelineHours } from './agenda-calendar'

describe('monthGrid', () => {
  it('starts weeks on Monday and pads the first and last week', () => {
    // November 2026 starts on a Sunday: 6 blank cells before the 1st.
    const weeks = monthGrid('2026-11-01')
    expect(weeks[0].slice(0, 6)).toEqual([null, null, null, null, null, null])
    expect(weeks[0][6]).toBe('2026-11-01')
    expect(weeks.flat().filter(Boolean)).toHaveLength(30)
    expect(weeks.every((w) => w.length === 7)).toBe(true)
  })

  it('puts a month that starts on Monday with no leading blanks', () => {
    // June 2026 starts on a Monday.
    expect(monthGrid('2026-06-01')[0][0]).toBe('2026-06-01')
  })
})

describe('minutesOfDay', () => {
  it('reads the local time in the business timezone', () => {
    // 20:30Z is 15:30 in Lima (UTC-5).
    expect(minutesOfDay('2026-11-18T20:30:00Z', 'America/Lima')).toBe(15 * 60 + 30)
  })
})

describe('layoutDay', () => {
  const lima = 'America/Lima'
  const at = (hhmm: string) => `2026-11-18T${hhmm}:00-05:00`
  const row = (id: string, from: string, to: string) => ({ id, start_time: at(from), end_time: at(to) })

  it('gives a lone appointment the full width', () => {
    const [a] = layoutDay([row('a', '14:00', '14:45')], lima)
    expect([a.lane, a.lanes, a.start, a.end]).toEqual([0, 1, 14 * 60, 14 * 60 + 45])
  })

  it('keeps back-to-back appointments in the same lane', () => {
    const items = layoutDay([row('a', '16:00', '17:00'), row('b', '17:00', '18:00')], lima)
    expect(items.map((i) => [i.lane, i.lanes])).toEqual([[0, 1], [0, 1]])
  })

  it('puts overlapping appointments side by side', () => {
    const items = layoutDay([row('a', '15:00', '16:00'), row('b', '15:30', '16:30')], lima)
    expect(items.map((i) => [i.lane, i.lanes])).toEqual([[0, 2], [1, 2]])
  })

  it('gives a very short appointment a tappable minimum height', () => {
    const [a] = layoutDay([row('a', '15:00', '15:05')], lima)
    expect(a.end - a.start).toBe(20)
  })
})

describe('timelineHours', () => {
  it('covers 9-20 by default', () => {
    expect(timelineHours([{ start: 12 * 60, end: 13 * 60 }])).toEqual({ startHour: 9, endHour: 20 })
  })

  it('widens for an appointment outside that range', () => {
    expect(timelineHours([{ start: 8 * 60 + 30, end: 21 * 60 + 15 }])).toEqual({ startHour: 8, endHour: 22 })
  })
})
