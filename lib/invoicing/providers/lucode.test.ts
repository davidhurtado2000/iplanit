import { describe, expect, it } from 'vitest'
import { LucodeProvider, fromLucodeResponse, toLucodeBody } from './lucode'
import { ProviderNetworkError, ProviderRequestError, type ProviderDocument } from '../types'

const boleta: ProviderDocument = {
  docType: '03',
  serie: 'B002',
  numero: 7,
  currency: 'PEN',
  issueDate: '2026-11-06',
  customer: { docType: '-', docNumber: null, name: 'Cliente', address: null, email: null },
  items: [
    {
      description: 'Corte de cabello',
      quantity: 1,
      unitCode: 'ZZ',
      unitValue: 50 / 1.18,
      unitPrice: 50,
      igvAffectationCode: '10',
      igvRate: 18,
      subtotal: 42.37,
      igv: 7.63,
      total: 50,
    },
  ],
  subtotal: 42.37,
  igv: 7.63,
  total: 50,
}

function fakeFetch(status: number, body: unknown) {
  return (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
}

describe('toLucodeBody', () => {
  it('sends an anonymous boleta as CLIENTE VARIOS', () => {
    const body = toLucodeBody(boleta)
    expect(body).toMatchObject({
      documento: 'boleta',
      serie: 'B002',
      numero: 7,
      tipo_operacion: '0101',
      cliente_tipo_de_documento: '1',
      cliente_numero_de_documento: '99999999',
      cliente_denominacion: 'CLIENTE VARIOS',
      cliente_direccion: '-',
      total: '50.00',
    })
    expect(body).not.toHaveProperty('fecha_de_vencimiento')
    expect((body.items as Record<string, string>[])[0]).toEqual({
      unidad_de_medida: 'ZZ',
      descripcion: 'Corte de cabello',
      cantidad: '1',
      valor_unitario: '42.372881',
      porcentaje_igv: '18',
      codigo_tipo_afectacion_igv: '10',
      nombre_tributo: 'IGV',
    })
  })

  it('adds the due date to a factura and maps exonerado items', () => {
    const factura: ProviderDocument = {
      ...boleta,
      docType: '01',
      serie: 'F002',
      customer: { docType: '6', docNumber: '20100066603', name: 'EMPRESA SAC', address: 'AV. LIMA 1', email: null },
      items: [{ ...boleta.items[0], igvAffectationCode: '20', igvRate: 0, unitValue: 50 }],
    }
    const body = toLucodeBody(factura)
    expect(body).toMatchObject({ documento: 'factura', fecha_de_vencimiento: '2026-11-06', cliente_tipo_de_documento: '6' })
    expect((body.items as Record<string, string>[])[0]).toMatchObject({ porcentaje_igv: '0', nombre_tributo: 'EXO' })
  })

  it('links a credit note to the original comprobante', () => {
    const body = toLucodeBody({
      ...boleta,
      docType: '07',
      serie: 'BC02',
      related: { docType: '03', serie: 'B002', numero: 7 },
      creditNoteReason: { code: '01', description: 'Anulación de la operación' },
    })
    expect(body).toMatchObject({
      documento: 'nota_credito',
      nota_credito_codigo_tipo: '01',
      documento_afectado: { documento: 'boleta', serie: 'B002', numero: 7 },
    })
    expect(body).not.toHaveProperty('tipo_operacion')
  })
})

describe('fromLucodeResponse', () => {
  const ref = { docType: '03' as const, serie: 'B002', numero: 7 }

  it('treats RECHAZADO as rejected even though success is true', () => {
    const result = fromLucodeResponse(
      { success: true, message: 'El comprobante presenta errores', payload: { estado: 'RECHAZADO' } },
      ref,
    )
    expect(result).toMatchObject({ outcome: 'rejected', description: 'El comprobante presenta errores' })
  })

  it('prefers the A4 PDF', () => {
    const result = fromLucodeResponse(
      { success: true, payload: { estado: 'ACEPTADO', pdf: { ticket: 't', a4: 'a4' }, cdr: 'c', xml: 'x' } },
      ref,
    )
    expect(result).toMatchObject({ outcome: 'accepted', pdfUrl: 'a4', cdrUrl: 'c', xmlUrl: 'x' })
  })
})

describe('LucodeProvider errors', () => {
  const ref = { docType: '03' as const, serie: 'B002', numero: 7 }
  const make = (fetchImpl: typeof fetch) => new LucodeProvider({ token: 't', environment: 'demo', fetchImpl })

  it('maps "emitido anteriormente" to duplicate', async () => {
    const p = make(fakeFetch(400, { success: false, message: 'ERROR: La boleta B002-7 fue emitido anteriormente.' }))
    await expect(p.issueDocument(boleta)).resolves.toMatchObject({ outcome: 'duplicate' })
  })

  it('maps "no existe" to not_found', async () => {
    const p = make(fakeFetch(400, { success: false, message: 'La boleta B002-7 no existe en nuestros registros' }))
    await expect(p.getStatus(ref)).resolves.toMatchObject({ outcome: 'not_found' })
  })

  it('does not retry a bad token', async () => {
    const p = make(fakeFetch(401, { success: false, message: 'Acceso no autorizado.' }))
    await expect(p.issueDocument(boleta)).rejects.toBeInstanceOf(ProviderRequestError)
  })

  it('retries server errors and network failures', async () => {
    await expect(make(fakeFetch(503, {})).issueDocument(boleta)).rejects.toBeInstanceOf(ProviderNetworkError)
    const failing = (async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    await expect(make(failing).issueDocument(boleta)).rejects.toBeInstanceOf(ProviderNetworkError)
  })
})
