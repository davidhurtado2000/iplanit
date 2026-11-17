import { describe, expect, it } from 'vitest'
import { getServiceBreakdown } from './analytics'
import type { ReservationExtra } from './reservation-services'

const from = new Date('2026-11-01T00:00:00Z')
const to = new Date('2026-11-30T23:59:59Z')
const services = [
  { id: 's1', name: 'Corte', color: '#111' },
  { id: 's2', name: 'Barba', color: '#222' },
] as never[]
const res = (over: Record<string, unknown>) =>
  ({ id: 'r1', type: 'booking', service_id: 's1', status: 'completed', price: 40, price_usd: null, start_time: '2026-11-10T15:00:00Z', ...over }) as never
const extra: ReservationExtra = {
  id: 'e1', business_id: 'b', reservation_id: 'r1', service_id: 's2', price: 15, price_usd: null, duration_minutes: 30, position: 1,
}

describe('getServiceBreakdown with extra services', () => {
  it('counts each service of the appointment under its own price', () => {
    const rows = getServiceBreakdown([res({})], services, from, to, [extra])
    const byId = Object.fromEntries(rows.map((r) => [r.serviceId, r]))
    expect(byId.s1.revenue).toBe(25) // 40 total - 15 of the extra
    expect(byId.s2.revenue).toBe(15)
    expect(rows.reduce((n, r) => n + r.revenue, 0)).toBe(40) // the total is unchanged
  })

  it('is unchanged without extras', () => {
    const rows = getServiceBreakdown([res({})], services, from, to)
    expect(rows).toHaveLength(1)
    expect(rows[0].revenue).toBe(40)
  })

  it('counts no revenue for a no-show but still counts the demand', () => {
    const rows = getServiceBreakdown([res({ status: 'no_show' })], services, from, to, [extra])
    expect(rows.reduce((n, r) => n + r.revenue, 0)).toBe(0)
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(2)
  })
})
