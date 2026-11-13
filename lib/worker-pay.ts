// Worker pay: how much of each appointment belongs to the worker
// (scripts/114-worker-pay.sql). Record-keeping only - iPlanit never moves
// money. Shared by the owner's report (Analytics -> Pagos) and the worker's
// own view (/mi-agenda) so both always show the same number.

/** Peru's IGV. Prices in iPlanit include it; a business can choose to work
 * the commission out on the price without it (businesses.pay_excludes_tax). */
export const PE_IGV_RATE = 0.18

export type PayType = 'commission' | 'salary'

/** The worker's and business's CURRENT settings - used for appointments that
 * have no snapshot (completed before the worker was set up, or not marked
 * completed yet). */
export interface PaySettings {
  payType: PayType | null
  commissionPct: number | null
  tipWorkerPct: number
  excludesTax: boolean
}

export interface PayRow {
  status: string
  end_time: string
  price: number | null
  price_usd: number | null
  tip_amount?: number | null
  worker_pay_pct?: number | null
  tip_worker_pct?: number | null
  pay_excludes_tax?: boolean | null
}

export interface Earning {
  /** What the client paid for the service (tip not included). */
  sale: number
  /** The amount the commission is worked out on (sale, or sale without IGV). */
  base: number
  /** Null = this worker's pay isn't set up, so there is nothing to work out. */
  servicePct: number | null
  serviceShare: number
  tip: number
  tipPct: number
  tipShare: number
  /** serviceShare + tipShare. */
  total: number
  /** What stays with the business: sale + tip - total. */
  businessShare: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Same rule the worker portal has always used for "Atendidas": completed,
 * or confirmed and already over (many shops never press "Completar").
 * No-shows and cancellations never count. */
export function countsAsServed(row: Pick<PayRow, 'status' | 'end_time'>, now: Date = new Date()): boolean {
  return row.status === 'completed' || (row.status === 'confirmed' && new Date(row.end_time) < now)
}

export function currentServicePct(settings: PaySettings): number | null {
  if (settings.payType === 'salary') return 0
  if (settings.payType === 'commission') return settings.commissionPct ?? null
  return null
}

export function earningFor(row: PayRow, settings: PaySettings): Earning {
  const sale = Number((row.price || row.price_usd) ?? 0)
  const snapshot = row.worker_pay_pct !== null && row.worker_pay_pct !== undefined
  const servicePct = snapshot ? Number(row.worker_pay_pct) : currentServicePct(settings)
  const excludesTax = snapshot ? Boolean(row.pay_excludes_tax) : settings.excludesTax
  const base = round2(excludesTax ? sale / (1 + PE_IGV_RATE) : sale)
  const serviceShare = servicePct === null ? 0 : round2((base * servicePct) / 100)
  const tip = Number(row.tip_amount ?? 0)
  const tipPct = snapshot && row.tip_worker_pct !== null && row.tip_worker_pct !== undefined
    ? Number(row.tip_worker_pct)
    : settings.tipWorkerPct
  const tipShare = round2((tip * tipPct) / 100)
  const total = round2(serviceShare + tipShare)
  return { sale, base, servicePct, serviceShare, tip, tipPct, tipShare, total, businessShare: round2(sale + tip - total) }
}

export interface EarningSummary {
  served: number
  sales: number
  serviceShare: number
  tips: number
  tipShare: number
  total: number
  businessShare: number
  /** Served appointments whose worker pay isn't set up (counted in sales and
   * tips, but with no commission). */
  unconfigured: number
}

export function summarizeEarnings(rows: PayRow[], settings: PaySettings, now: Date = new Date()): EarningSummary {
  const out: EarningSummary = {
    served: 0, sales: 0, serviceShare: 0, tips: 0, tipShare: 0, total: 0, businessShare: 0, unconfigured: 0,
  }
  for (const row of rows) {
    if (!countsAsServed(row, now)) continue
    const e = earningFor(row, settings)
    out.served += 1
    out.sales += e.sale
    out.serviceShare += e.serviceShare
    out.tips += e.tip
    out.tipShare += e.tipShare
    out.total += e.total
    out.businessShare += e.businessShare
    if (e.servicePct === null) out.unconfigured += 1
  }
  for (const k of ['sales', 'serviceShare', 'tips', 'tipShare', 'total', 'businessShare'] as const) {
    out[k] = round2(out[k])
  }
  return out
}

/** "S/ 12.50" / "$ 12" - two decimals only when there are cents. */
export function formatMoney(amount: number, currencySymbol: string): string {
  const fixed = Number.isInteger(round2(amount)) ? amount.toFixed(0) : amount.toFixed(2)
  return `${currencySymbol} ${fixed}`
}
