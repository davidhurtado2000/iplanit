import { describe, expect, it } from 'vitest'
import { extraAmount, extrasTotal, groupExtras, serviceLabel, type ReservationExtra } from './reservation-services'

const extra = (over: Partial<ReservationExtra>): ReservationExtra => ({
  id: 'e', business_id: 'b', reservation_id: 'r1', service_id: 's2', price: 10, price_usd: null, duration_minutes: 30, position: 1, ...over,
})
const services = [{ id: 's1', name: 'Corte de cabello' }, { id: 's2', name: 'Barba' }, { id: 's3', name: 'Tinte' }]

describe('reservation extras', () => {
  it('groups by reservation in the order they were added', () => {
    const grouped = groupExtras([
      extra({ id: 'a', reservation_id: 'r1', service_id: 's3', position: 2 }),
      extra({ id: 'b', reservation_id: 'r1', service_id: 's2', position: 1 }),
      extra({ id: 'c', reservation_id: 'r2', position: 1 }),
    ])
    expect(grouped.get('r1')?.map((e) => e.id)).toEqual(['b', 'a'])
    expect(grouped.get('r2')?.length).toBe(1)
  })

  it('joins the names of the main service and its extras', () => {
    expect(serviceLabel('Corte de cabello', [extra({ service_id: 's2' })], services)).toBe('Corte de cabello + Barba')
    expect(serviceLabel('Corte de cabello', [extra({ service_id: 's2' }), extra({ service_id: 's3' })], services)).toBe(
      'Corte de cabello + Barba + Tinte'
    )
  })

  it('is just the main service when there are no extras', () => {
    expect(serviceLabel('Corte de cabello', [], services)).toBe('Corte de cabello')
  })

  it('adds extras using whichever currency is filled', () => {
    expect(extraAmount(extra({ price: null, price_usd: 7 }))).toBe(7)
    expect(extrasTotal([extra({ price: 10 }), extra({ price: 15 })])).toBe(25)
  })
})
