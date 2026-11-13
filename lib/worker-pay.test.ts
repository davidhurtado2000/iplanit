import { describe, expect, it } from 'vitest'
import { countsAsServed, earningFor, formatMoney, summarizeEarnings, type PaySettings, type PayRow } from './worker-pay'

const commission40: PaySettings = { payType: 'commission', commissionPct: 40, tipWorkerPct: 80, excludesTax: false }
const past = '2026-01-01T10:00:00Z'
const now = new Date('2026-06-01T00:00:00Z')
const row = (over: Partial<PayRow> = {}): PayRow => ({
  status: 'completed', end_time: past, price: 50, price_usd: null, ...over,
})

describe('earningFor', () => {
  it('splits the service and the tip with the current settings when there is no snapshot', () => {
    const e = earningFor(row({ tip_amount: 10 }), commission40)
    expect(e.serviceShare).toBe(20)
    expect(e.tipShare).toBe(8)
    expect(e.total).toBe(28)
    expect(e.businessShare).toBe(32)
  })

  it('uses the snapshot taken at completion over the current settings', () => {
    const e = earningFor(row({ tip_amount: 10, worker_pay_pct: 50, tip_worker_pct: 100, pay_excludes_tax: false }), commission40)
    expect(e.serviceShare).toBe(25)
    expect(e.tipShare).toBe(10)
  })

  it('works the commission out without IGV when asked', () => {
    const e = earningFor(row({ price: 59 }), { ...commission40, excludesTax: true })
    expect(e.base).toBe(50)
    expect(e.serviceShare).toBe(20)
  })

  it('gives a salaried worker no share of services but still their tips', () => {
    const e = earningFor(row({ tip_amount: 10 }), { ...commission40, payType: 'salary' })
    expect(e.servicePct).toBe(0)
    expect(e.serviceShare).toBe(0)
    expect(e.tipShare).toBe(8)
  })

  it('reports an unconfigured worker as such instead of inventing a %', () => {
    const e = earningFor(row(), { payType: null, commissionPct: null, tipWorkerPct: 100, excludesTax: false })
    expect(e.servicePct).toBeNull()
    expect(e.serviceShare).toBe(0)
  })

  it('reads price_usd when price is empty', () => {
    expect(earningFor(row({ price: null, price_usd: 30 }), commission40).sale).toBe(30)
  })
})

describe('summarizeEarnings', () => {
  it('only counts served appointments', () => {
    const s = summarizeEarnings(
      [
        row({ tip_amount: 5 }),
        row({ status: 'confirmed' }),
        row({ status: 'no_show' }),
        row({ status: 'cancelled' }),
        row({ status: 'confirmed', end_time: '2026-12-01T00:00:00Z' }),
      ],
      commission40,
      now
    )
    expect(s.served).toBe(2)
    expect(s.sales).toBe(100)
    expect(s.serviceShare).toBe(40)
    expect(s.tipShare).toBe(4)
    expect(s.total).toBe(44)
  })

  it('counts appointments with no pay set up', () => {
    const s = summarizeEarnings([row(), row()], { payType: null, commissionPct: null, tipWorkerPct: 100, excludesTax: false }, now)
    expect(s.unconfigured).toBe(2)
  })
})

describe('helpers', () => {
  it('countsAsServed', () => {
    expect(countsAsServed({ status: 'pending', end_time: past }, now)).toBe(false)
  })
  it('formatMoney', () => {
    expect(formatMoney(12, 'S/')).toBe('S/ 12')
    expect(formatMoney(12.5, 'S/')).toBe('S/ 12.50')
  })
})
