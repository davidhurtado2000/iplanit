import { describe, expect, it } from 'vitest'
import type { InvoiceRow } from '@/lib/supabase/types'
import { isDue, refreshDueInvoices } from './retry'
import { MemoryInvoiceStore } from './memory-store'
import { MockProvider } from './providers/mock'
import { emitDraft } from './emit'
import type { InvoicingSetup } from './service'
import type { InvoiceDraft } from './types'

const NOW = new Date('2026-11-07T15:00:00Z')
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString()

function row(patch: Partial<InvoiceRow>): InvoiceRow {
  return { status: 'pending', next_retry_at: null, created_at: minutesAgo(1), ...patch } as InvoiceRow
}

describe('isDue', () => {
  it('is due once the scheduled retry time has passed', () => {
    expect(isDue(row({ status: 'sent', next_retry_at: minutesAgo(1) }), NOW)).toBe(true)
    expect(isDue(row({ status: 'sent', next_retry_at: new Date(NOW.getTime() + 60_000).toISOString() }), NOW)).toBe(false)
  })

  it('waits before picking up a pending row nobody scheduled', () => {
    expect(isDue(row({ created_at: minutesAgo(1) }), NOW)).toBe(false)
    expect(isDue(row({ created_at: minutesAgo(10) }), NOW)).toBe(true)
  })

  it('never retries final or failed comprobantes', () => {
    for (const status of ['accepted', 'rejected', 'voided', 'error'] as const) {
      expect(isDue(row({ status, next_retry_at: minutesAgo(5) }), NOW)).toBe(false)
    }
  })
})

describe('refreshDueInvoices', () => {
  it('picks up the SUNAT answer for a comprobante left waiting', async () => {
    const store = new MemoryInvoiceStore()
    const provider = new MockProvider().willDo('pending')
    const draft: InvoiceDraft = {
      docType: '03',
      serie: 'B002',
      currency: 'PEN',
      issueDate: '2026-11-07',
      customer: { docType: '-', docNumber: null, name: 'Cliente', address: null, email: null },
      items: [],
      subtotal: 42.37,
      igv: 7.63,
      total: 50,
    }
    const ctx = { businessId: 'b1', ruc: '20602148255', environment: 'demo' as const, reservationId: 'r1', createdBy: null }
    const { invoice } = await emitDraft({ store, provider, draft, ctx, now: NOW })
    expect(invoice.status).toBe('sent')

    provider.resolve({ docType: '03', serie: 'B002', numero: invoice.numero }, 'accepted')
    const setup = { store, provider } as unknown as InvoicingSetup
    // Scheduled retry time is in the future: nothing happens yet.
    expect((await refreshDueInvoices(setup, [invoice], NOW))[0].status).toBe('sent')

    const due = { ...invoice, next_retry_at: minutesAgo(1) }
    const [refreshed] = await refreshDueInvoices(setup, [due], NOW)
    expect(refreshed.status).toBe('accepted')
    expect(provider.calls.issue).toBe(1) // checked the status, never resent
  })
})
