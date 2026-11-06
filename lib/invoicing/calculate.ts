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

  if (!taxed || input.pricesIncludeIgv) {
    unitPrice = round2(input.amount)
    total = round2(unitPrice * quantity)
    subtotal = round2(total / factor)
    igv = round2(total - subtotal)
    unitValue = round6(unitPrice / factor)
  } else {
    unitValue = round6(input.amount)
    subtotal = round2(input.amount * quantity)
    igv = round2(subtotal * (rate / 100))
    total = round2(subtotal + igv)
    unitPrice = round2(input.amount * factor)
  }

  return {
    description: input.description,
    quantity,
    unitCode: 'ZZ',
    unitValue,
    unitPrice,
    igvAffectationCode: AFFECTATION_CODE[input.affectation],
    igvRate: rate,
    subtotal,
    igv,
    total,
  }
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
