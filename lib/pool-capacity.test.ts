import { describe, expect, it } from 'vitest'
import { applyPoolCapacity } from './pool-capacity'

const at = (hhmm: string) => new Date(`2026-11-18T${hhmm}:00Z`)
const range = (from: string, to: string) => ({ start_time: at(from).toISOString(), end_time: at(to).toISOString() })
const times = (dates: Date[]) => dates.map((d) => d.toISOString().slice(11, 16))

describe('applyPoolCapacity', () => {
  const threeFree = [[at('14:00')], [at('14:00')], [at('14:00')]]

  it('offers the hour to everyone while barbers outnumber pool bookings', () => {
    const r = applyPoolCapacity({ perWorkerSlots: threeFree, poolRanges: [range('14:00', '14:45'), range('14:00', '14:45')], durationMinutes: 45 })
    expect(times(r.anySlots)).toEqual(['14:00'])
    expect(r.workerSlots.map(times)).toEqual([['14:00'], ['14:00'], ['14:00']])
  })

  it('stops offering the hour once pool bookings use every free barber', () => {
    const r = applyPoolCapacity({
      perWorkerSlots: threeFree,
      poolRanges: [range('14:00', '14:45'), range('14:00', '14:45'), range('14:00', '14:45')],
      durationMinutes: 45,
    })
    expect(r.anySlots).toEqual([])
    expect(r.workerSlots.flat()).toEqual([])
  })

  it("keeps a loyal client's barber bookable while others can cover the pool", () => {
    // Paul is free at 14:00 but another barber is booked elsewhere: 2 free, 1 in the pool.
    const r = applyPoolCapacity({
      perWorkerSlots: [[at('14:00')], [at('14:00')], []],
      poolRanges: [range('14:00', '14:45')],
      durationMinutes: 45,
    })
    expect(times(r.workerSlots[0])).toEqual(['14:00'])
    expect(times(r.anySlots)).toEqual(['14:00'])
  })

  it('blocks everyone when the only free barber is needed by the pool', () => {
    const r = applyPoolCapacity({
      perWorkerSlots: [[at('14:00')], [], []],
      poolRanges: [range('14:00', '14:45')],
      durationMinutes: 45,
    })
    expect(r.anySlots).toEqual([])
    expect(r.workerSlots[0]).toEqual([])
  })

  it("doesn't offer a barber who isn't free at that time", () => {
    const r = applyPoolCapacity({
      perWorkerSlots: [[at('14:00')], [at('15:00')]],
      poolRanges: [],
      durationMinutes: 45,
    })
    expect(times(r.workerSlots[0])).toEqual(['14:00'])
    expect(times(r.workerSlots[1])).toEqual(['15:00'])
    expect(times(r.anySlots)).toEqual(['14:00', '15:00'])
  })

  it('only counts pool bookings that overlap the appointment', () => {
    const r = applyPoolCapacity({
      perWorkerSlots: [[at('14:00'), at('15:00')]],
      poolRanges: [range('14:00', '14:45')],
      durationMinutes: 45,
    })
    expect(times(r.anySlots)).toEqual(['15:00'])
  })

  it('counts a pool booking that touches the appointment through its buffers', () => {
    const r = applyPoolCapacity({
      perWorkerSlots: [[at('14:45')]],
      poolRanges: [range('14:00', '14:45')],
      durationMinutes: 45,
      bufferBeforeMinutes: 10,
    })
    expect(r.anySlots).toEqual([])
  })

  it('without pool bookings behaves like a plain union of the barbers', () => {
    const r = applyPoolCapacity({ perWorkerSlots: [[at('14:00')], [at('14:30')]], poolRanges: [], durationMinutes: 30 })
    expect(times(r.anySlots)).toEqual(['14:00', '14:30'])
  })
})
