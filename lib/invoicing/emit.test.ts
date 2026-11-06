import { describe, expect, it } from 'vitest'
import { buildCreditNoteDraft, buildReservationDraft } from './build-draft'
import { emitDraft, MAX_ATTEMPTS, sendInvoice, type EmitContext } from './emit'
import { MemoryInvoiceStore } from './memory-store'
import { MockProvider } from './providers/mock'
import type { InvoiceDraft, InvoiceItem } from './types'

const NOW = new Date('2026-11-06T21:00:00Z')
const settings = {
  serieBoleta: 'B001',
  serieFactura: 'F001',
  serieNcBoleta: 'BC01',
  serieNcFactura: 'FC01',
  pricesIncludeIgv: true,
  igvRate: 18,
  igvAffectation: 'gravado' as const,
}

function boletaDraft(price = 50): InvoiceDraft {
  const result = buildReservationDraft({
    kind: null,
    settings,
    currency: 'PEN',
    reservation: { startTime: '2026-11-06T20:00:00Z', price },
    serviceName: 'Corte',
    client: null,
    now: NOW,
  })
  if (!result.ok) throw new Error(result.message)
  return result.draft
}

function ctx(reservationId: string, extra: Partial<EmitContext> = {}): EmitContext {
  return {
    businessId: 'biz-1',
    ruc: '20131312955',
    environment: 'demo',
    reservationId,
    createdBy: 'user-1',
    ...extra,
  }
}

function setup() {
  return { store: new MemoryInvoiceStore(), provider: new MockProvider() }
}

describe('emission', () => {
  it('emits and records an accepted boleta', async () => {
    const { store, provider } = setup()
    const { invoice, reused } = await emitDraft({ store, provider, draft: boletaDraft(), ctx: ctx('r1'), now: NOW })
    expect(reused).toBe(false)
    expect(invoice).toMatchObject({
      serie: 'B001',
      numero: 1,
      status: 'accepted',
      attempts: 1,
      environment: 'demo',
      pdf_url: 'https://mock.invalid/B001-1.pdf',
    })
  })

  it('never issues two comprobantes for the same reservation (double click)', async () => {
    const { store, provider } = setup()
    const first = await emitDraft({ store, provider, draft: boletaDraft(), ctx: ctx('r1'), now: NOW })
    const second = await emitDraft({ store, provider, draft: boletaDraft(), ctx: ctx('r1'), now: NOW })
    expect(second.reused).toBe(true)
    expect(second.invoice.id).toBe(first.invoice.id)
    expect(provider.calls.issue).toBe(1)
    expect(store.rows.size).toBe(1)
  })

  it('gives different, consecutive numbers to reservations completed at the same time', async () => {
    const { store, provider } = setup()
    const results = await Promise.all(
      ['r1', 'r2', 'r3'].map((id) => emitDraft({ store, provider, draft: boletaDraft(), ctx: ctx(id), now: NOW })),
    )
    expect(results.map((r) => r.invoice.numero).sort()).toEqual([1, 2, 3])
  })
})

describe('retries', () => {
  it('leaves a comprobante pending after a network error and sends it on retry', async () => {
    const { store, provider } = setup()
    provider.willDo('network_error')
    const { invoice } = await emitDraft({ store, provider, draft: boletaDraft(), ctx: ctx('r1'), now: NOW })
    expect(invoice).toMatchObject({ status: 'pending', attempts: 1, numero: 1 })
    expect(invoice.next_retry_at).toBe('2026-11-06T21:05:00.000Z')

    const retried = await sendInvoice({ store, provider, invoice, now: NOW })
    expect(retried).toMatchObject({ status: 'accepted', attempts: 2, numero: 1 })
  })

  it('does not resend a comprobante that got through before a timeout', async () => {
    const { store, provider } = setup()
    provider.willDo('timeout_after_save')
    const { invoice } = await emitDraft({ store, provider, draft: boletaDraft(), ctx: ctx('r1'), now: NOW })
    expect(invoice.status).toBe('pending')

    const retried = await sendInvoice({ store, provider, invoice, now: NOW })
    expect(retried.status).toBe('accepted')
    expect(provider.calls.issue).toBe(1)
    expect(provider.calls.status).toBe(1)
  })

  it(`marks a comprobante as error after ${MAX_ATTEMPTS} failed attempts`, async () => {
    const { store, provider } = setup()
    provider.willDo(...Array(MAX_ATTEMPTS).fill('network_error'))
    let { invoice } = await emitDraft({ store, provider, draft: boletaDraft(), ctx: ctx('r1'), now: NOW })
    while (invoice.status === 'pending') {
      invoice = await sendInvoice({ store, provider, invoice, now: NOW })
    }
    expect(invoice).toMatchObject({ status: 'error', attempts: MAX_ATTEMPTS, next_retry_at: null })
  })

  it('does not retry on its own when the provider refuses the data', async () => {
    const { store, provider } = setup()
    provider.willDo('request_error')
    const { invoice } = await emitDraft({ store, provider, draft: boletaDraft(), ctx: ctx('r1'), now: NOW })
    expect(invoice).toMatchObject({ status: 'error', next_retry_at: null })

    const again = await sendInvoice({ store, provider, invoice, now: NOW })
    expect(again.attempts).toBe(1)

    const manual = await sendInvoice({ store, provider, invoice, now: NOW, manualRetry: true })
    expect(manual.status).toBe('accepted')
  })

  it('polls a comprobante SUNAT has not answered yet', async () => {
    const { store, provider } = setup()
    provider.willDo('pending')
    const { invoice } = await emitDraft({ store, provider, draft: boletaDraft(), ctx: ctx('r1'), now: NOW })
    expect(invoice.status).toBe('sent')

    provider.resolve({ docType: '03', serie: 'B001', numero: 1 }, 'accepted')
    const polled = await sendInvoice({ store, provider, invoice, now: NOW })
    expect(polled.status).toBe('accepted')
    expect(provider.calls.issue).toBe(1)
  })

  it('records a SUNAT rejection', async () => {
    const { store, provider } = setup()
    provider.willDo('reject')
    const { invoice } = await emitDraft({ store, provider, draft: boletaDraft(), ctx: ctx('r1'), now: NOW })
    expect(invoice).toMatchObject({ status: 'rejected', sunat_description: 'Mock: rechazado por SUNAT' })
  })

  it('allows a new comprobante for a reservation whose previous one was rejected', async () => {
    const { store, provider } = setup()
    provider.willDo('reject')
    const first = await emitDraft({ store, provider, draft: boletaDraft(), ctx: ctx('r1'), now: NOW })
    const second = await emitDraft({ store, provider, draft: boletaDraft(), ctx: ctx('r1'), now: NOW })
    expect(second.invoice.id).not.toBe(first.invoice.id)
    expect(second.invoice).toMatchObject({ status: 'accepted', numero: 2 })
  })
})

describe('credit notes', () => {
  it('links the credit note to the original and voids it once accepted', async () => {
    const { store, provider } = setup()
    const { invoice: original } = await emitDraft({ store, provider, draft: boletaDraft(), ctx: ctx('r1'), now: NOW })

    const ncDraft = buildCreditNoteDraft(
      {
        docType: original.doc_type,
        serie: original.serie,
        numero: original.numero,
        currency: original.currency,
        customer: {
          docType: original.customer_doc_type,
          docNumber: original.customer_doc_number,
          name: original.customer_name,
          address: original.customer_address,
          email: original.customer_email,
        },
        items: original.items as unknown as InvoiceItem[],
        subtotal: original.subtotal,
        igv: original.igv,
        total: original.total,
      },
      settings,
      '01',
      NOW,
    )
    const { invoice: nc } = await emitDraft({
      store,
      provider,
      draft: ncDraft,
      ctx: ctx('r1', { relatedInvoiceId: original.id }),
      now: NOW,
    })

    expect(nc).toMatchObject({ doc_type: '07', serie: 'BC01', numero: 1, status: 'accepted', credit_note_reason: '01' })
    expect((await store.getById(original.id))?.status).toBe('voided')

    const sent = provider.documents.get('07-BC01-1')?.doc
    expect(sent?.related).toEqual({ docType: '03', serie: 'B001', numero: 1 })
    expect(sent?.creditNoteReason).toEqual({ code: '01', description: 'Anulación de la operación' })
  })
})
