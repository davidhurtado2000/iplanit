import type { IgvAffectation, InvoiceItem } from './types'

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function round6(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e6) / 1e6
}

const AFFECTATION_CODE: Record<IgvAffectation, InvoiceItem['igvAffectationCode']> = {
  gravado: '10',
  exonerado: '20',
  inafecto: '30',
}

export type LineInput = {
  description: string
  // Unit amount as the business charges it (with or without IGV, see below).
  amount: number
  quantity?: number
  pricesIncludeIgv: boolean
  igvRate: number // e.g. 18
  affectation: IgvAffectation
  // A discount in the same terms as `amount` (with IGV when prices include
  // it). `amount` is then the price BEFORE the discount.
  discount?: number
}

// One comprobante line. When prices include IGV (the usual case for a
// barbershop), the total stays exactly what the client paid and IGV is
// carved out of it; otherwise IGV is added on top.
export function buildLine(input: LineInput): InvoiceItem {
  const quantity = input.quantity ?? 1
  const taxed = input.affectation === 'gravado'
  const rate = taxed ? input.igvRate : 0
  const factor = 1 + rate / 100

  let subtotal: number
  let igv: number
  let total: number
  let unitPrice: number
  let unitValue: number
  let discountValue: number | undefined

  if (!taxed || input.pricesIncludeIgv) {
    unitPrice = round2(input.amount)
    const gross = round2(unitPrice * quantity)
    const discount = Math.min(round2(Math.max(input.discount ?? 0, 0)), gross)
    total = round2(gross - discount)
    subtotal = round2(total / factor)
    igv = round2(total - subtotal)
    unitValue = round6(unitPrice / factor)
    if (discount > 0) discountValue = discountBeforeTax(unitValue * quantity, discount, factor, total)
  } else {
    unitValue = round6(input.amount)
    const base = round2(input.amount * quantity)
    const discount = Math.min(round2(Math.max(input.discount ?? 0, 0)), base)
    subtotal = round2(base - discount)
    igv = round2(subtotal * (rate / 100))
    total = round2(subtotal + igv)
    unitPrice = round2(input.amount * factor)
    if (discount > 0) discountValue = discount
  }

  return {
    description: input.description,
    quantity,
    unitCode: 'ZZ',
    unitValue,
    unitPrice,
    igvAffectationCode: AFFECTATION_CODE[input.affectation],
    igvRate: rate,
    ...(discountValue !== undefined ? { discount: discountValue } : {}),
    subtotal,
    igv,
    total,
  }
}

// The discount as the provider wants it: WITHOUT IGV and with 2 decimals.
// Rounding that to cents can move the total the provider works out by a
// cent, so pick the nearby value whose result matches the total we expect.
function discountBeforeTax(grossValue: number, discountWithTax: number, factor: number, expectedTotal: number): number {
  const exact = round2(discountWithTax / factor)
  if (factor === 1) return exact
  const candidates = [exact, round2(exact - 0.01), round2(exact + 0.01)].filter((c) => c >= 0)
  const miss = (c: number) => Math.abs(round2((grossValue - c) * factor) - expectedTotal)
  return candidates.reduce((best, c) => (miss(c) < miss(best) ? c : best), candidates[0])
}

export function sumLines(items: InvoiceItem[]): { subtotal: number; igv: number; total: number } {
  return items.reduce(
    (acc, item) => ({
      subtotal: round2(acc.subtotal + item.subtotal),
      igv: round2(acc.igv + item.igv),
      total: round2(acc.total + item.total),
    }),
    { subtotal: 0, igv: 0, total: 0 },
  )
}
