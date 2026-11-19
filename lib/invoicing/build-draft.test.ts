import { describe, expect, it } from 'vitest'
import { buildCreditNoteDraft, buildReservationDraft, type DraftInput } from './build-draft'
import { buildLine } from './calculate'
import { isValidRuc, limaDate, toSunatDocument } from './documents'

// SUNAT's own RUC, a public and valid number.
const VALID_RUC = '20131312955'

const settings: DraftInput['settings'] = {
  serieBoleta: 'B001',
  serieFactura: 'F001',
  serieNcBoleta: 'BC01',
  serieNcFactura: 'FC01',
  pricesIncludeIgv: true,
  igvRate: 18,
  igvAffectation: 'gravado',
}

function input(overrides: Partial<DraftInput> = {}): DraftInput {
  return {
    kind: null,
    settings,
    currency: 'PEN',
    reservation: { startTime: '2026-11-06T20:00:00Z', price: 50 },
    serviceName: 'Corte clásico',
    client: {
      name: 'Juan Pérez',
      email: 'juan@example.com',
      documentType: 'dni',
      documentNumber: '12345678',
      fiscalName: null,
      fiscalAddress: null,
    },
    now: new Date('2026-11-06T21:00:00Z'),
    ...overrides,
  }
}

describe('documents', () => {
  it('validates the RUC check digit', () => {
    expect(isValidRuc(VALID_RUC)).toBe(true)
    expect(isValidRuc('20131312954')).toBe(false)
    expect(isValidRuc('30131312955')).toBe(false)
  })

  it('detects a RUC saved as "dni" by the public booking page', () => {
    expect(toSunatDocument('dni', VALID_RUC)).toEqual({ docType: '6', docNumber: VALID_RUC })
    expect(toSunatDocument('dni', '1234567')).toBeNull()
  })

  it('dates comprobantes in Lima time, not UTC', () => {
    // 02:30 UTC on the 7th is 21:30 on the 6th in Lima.
    expect(limaDate(new Date('2026-11-07T02:30:00Z'))).toBe('2026-11-06')
  })
})

describe('amounts', () => {
  it('carves IGV out of a price that already includes it', () => {
    const line = buildLine({ description: 'x', amount: 50, pricesIncludeIgv: true, igvRate: 18, affectation: 'gravado' })
    expect(line).toMatchObject({ subtotal: 42.37, igv: 7.63, total: 50, igvAffectationCode: '10' })
  })

  it('adds IGV on top when prices exclude it', () => {
    const line = buildLine({ description: 'x', amount: 50, pricesIncludeIgv: false, igvRate: 18, affectation: 'gravado' })
    expect(line).toMatchObject({ subtotal: 50, igv: 9, total: 59 })
  })

  it('charges no IGV on exonerated services', () => {
    const line = buildLine({ description: 'x', amount: 50, pricesIncludeIgv: true, igvRate: 18, affectation: 'exonerado' })
    expect(line).toMatchObject({ subtotal: 50, igv: 0, total: 50, igvAffectationCode: '20' })
  })
})

describe('boletas', () => {
  it('uses the client DNI when there is one', () => {
    const result = buildReservationDraft(input())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.draft).toMatchObject({ docType: '03', serie: 'B001', issueDate: '2026-11-06', total: 50 })
    expect(result.draft.customer).toMatchObject({ docType: '1', docNumber: '12345678', name: 'Juan Pérez' })
    expect(result.draft.items[0].description).toBe('Corte clásico - 06/11/2026')
  })

  it('goes to "clientes varios" without a document under S/ 700', () => {
    const result = buildReservationDraft(input({ client: null }))
    expect(result.ok && result.draft.customer).toMatchObject({ docType: '-', docNumber: null, name: 'CLIENTES VARIOS' })
  })

  it('allows exactly S/ 700 without a document', () => {
    const result = buildReservationDraft(input({ client: null, reservation: { startTime: '2026-11-06T20:00:00Z', price: 700 } }))
    expect(result.ok).toBe(true)
  })

  it('refuses a boleta over S/ 700 without a document', () => {
    const result = buildReservationDraft(input({ client: null, reservation: { startTime: '2026-11-06T20:00:00Z', price: 700.5 } }))
    expect(result).toMatchObject({ ok: false, code: 'boleta_requires_document' })
  })

  it('accepts a boleta over S/ 700 with a DNI', () => {
    const result = buildReservationDraft(input({ reservation: { startTime: '2026-11-06T20:00:00Z', price: 900 } }))
    expect(result.ok).toBe(true)
  })

  it('applies the S/ 700 rule in soles for USD comprobantes', () => {
    const usd = { currency: 'USD' as const, client: null, reservation: { startTime: '2026-11-06T20:00:00Z', price: 200 } }
    expect(buildReservationDraft(input(usd))).toMatchObject({ ok: false, code: 'exchange_rate_required' })
    expect(buildReservationDraft(input({ ...usd, usdToPen: 3.75 }))).toMatchObject({ ok: false, code: 'boleta_requires_document' })
    expect(buildReservationDraft(input({ ...usd, usdToPen: 3.4 })).ok).toBe(true)
  })

  it('uses the amount edited in the preview', () => {
    const result = buildReservationDraft(input({ overrides: { amount: 40, description: 'Corte con descuento' } }))
    expect(result.ok && result.draft).toMatchObject({ total: 40, items: [{ description: 'Corte con descuento' }] })
  })

  it('refuses a reservation without an amount', () => {
    const result = buildReservationDraft(input({ reservation: { startTime: '2026-11-06T20:00:00Z', price: null } }))
    expect(result).toMatchObject({ ok: false, code: 'no_amount' })
  })
})

describe('facturas', () => {
  const rucClient = {
    name: 'Contacto',
    email: null,
    documentType: 'ruc',
    documentNumber: VALID_RUC,
    fiscalName: 'EMPRESA EJEMPLO S.A.C.',
    fiscalAddress: 'Av. Larco 123, Miraflores',
  }

  it('issues a factura to a valid RUC with its razón social', () => {
    const result = buildReservationDraft(input({ kind: 'factura', client: rucClient }))
    expect(result.ok && result.draft).toMatchObject({
      docType: '01',
      serie: 'F001',
      customer: { docType: '6', docNumber: VALID_RUC, name: 'EMPRESA EJEMPLO S.A.C.' },
    })
  })

  it('refuses a factura without a valid RUC', () => {
    expect(buildReservationDraft(input({ kind: 'factura' }))).toMatchObject({ ok: false, code: 'factura_requires_ruc' })
    expect(
      buildReservationDraft(input({ kind: 'factura', client: { ...rucClient, documentNumber: '20131312954' } })),
    ).toMatchObject({ ok: false, code: 'factura_requires_ruc' })
  })

  it('refuses a factura without a razón social', () => {
    const client = { ...rucClient, documentType: 'dni', fiscalName: null }
    expect(buildReservationDraft(input({ kind: 'factura', client }))).toMatchObject({
      ok: false,
      code: 'factura_requires_name',
    })
  })
})

describe('credit notes', () => {
  it('uses the credit-note series that matches the original', () => {
    const boleta = buildReservationDraft(input())
    if (!boleta.ok) throw new Error('expected a boleta')
    const nc = buildCreditNoteDraft({ ...boleta.draft, numero: 7 }, settings, '01', new Date('2026-11-08T15:00:00Z'))
    expect(nc).toMatchObject({
      docType: '07',
      serie: 'BC01',
      total: 50,
      related: { docType: '03', serie: 'B001', numero: 7 },
      creditNoteReason: { code: '01', description: 'Anulación de la operación' },
    })
  })
})

describe('discounts', () => {
  it('a boleta carries the discount as its own line field (60 sold at 51)', () => {
    const result = buildReservationDraft(input({ reservation: { startTime: '2026-11-06T20:00:00Z', price: 51, discount: 9 } }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const item = result.draft.items[0]
    expect(result.draft.total).toBe(51) // what the client paid
    expect(item.unitPrice).toBe(60) // the line keeps the normal price
    expect(item.discount).toBe(7.63) // 9 without IGV
    expect(result.draft.subtotal + result.draft.igv).toBeCloseTo(51, 2)
  })

  it('picks the discount value so the provider total matches to the cent', () => {
    for (const [normal, discount] of [[60, 9], [50, 7], [35, 5], [80, 12.5], [45, 4.5], [100, 33.33]]) {
      const line = buildLine({
        description: 'x', amount: normal, discount, pricesIncludeIgv: true, igvRate: 18, affectation: 'gravado',
      })
      const providerTotal = Math.round((line.unitValue - (line.discount ?? 0)) * 1.18 * 100) / 100
      expect(providerTotal).toBe(Math.round((normal - discount) * 100) / 100)
      expect(line.total).toBe(Math.round((normal - discount) * 100) / 100)
    }
  })

  it('without IGV in the price, the discount is taken off the base', () => {
    const line = buildLine({
      description: 'x', amount: 100, discount: 10, pricesIncludeIgv: false, igvRate: 18, affectation: 'gravado',
    })
    expect(line).toMatchObject({ discount: 10, subtotal: 90, igv: 16.2, total: 106.2 })
  })

  it('a line without a discount has no discount field', () => {
    expect(buildLine({ description: 'x', amount: 50, pricesIncludeIgv: true, igvRate: 18, affectation: 'gravado' })).not.toHaveProperty('discount')
  })

  it('a factura goes out at the paid amount with the discount noted', () => {
    const result = buildReservationDraft(
      input({
        kind: 'factura',
        reservation: { startTime: '2026-11-06T20:00:00Z', price: 51, discount: 9 },
        client: { name: 'ACME SAC', email: null, documentType: 'ruc', documentNumber: VALID_RUC, fiscalName: 'ACME SAC', fiscalAddress: null },
      })
    )
    expect(result.ok && result.draft.total).toBe(51)
    expect(result.ok && result.draft.items[0].discount).toBeUndefined()
    expect(result.ok && result.draft.items[0].description).toContain('descuento 9.00')
  })
})
