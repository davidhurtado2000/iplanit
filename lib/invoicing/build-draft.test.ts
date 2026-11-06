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
