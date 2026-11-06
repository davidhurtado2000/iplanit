import type { InvoiceRow } from '@/lib/supabase/types'
import type { InvoiceStore, NewInvoice } from './emit'

// In-memory InvoiceStore with the same rules as scripts/110's
// create_pending_invoice: one counter per (RUC, series), and at most one live
// factura/boleta per reservation. For tests and local development only.
export class MemoryInvoiceStore implements InvoiceStore {
  readonly rows = new Map<string, InvoiceRow>()
  private counters = new Map<string, number>()
  private nextId = 1

  async createPending(invoice: NewInvoice): Promise<InvoiceRow> {
    if (invoice.reservation_id && (invoice.doc_type === '01' || invoice.doc_type === '03')) {
      const live = [...this.rows.values()].find(
        (r) =>
          r.reservation_id === invoice.reservation_id &&
          (r.doc_type === '01' || r.doc_type === '03') &&
          r.status !== 'rejected' &&
          r.status !== 'voided',
      )
      if (live) return { ...live }
    }

    const counterKey = `${invoice.ruc}|${invoice.serie}`
    const numero = (this.counters.get(counterKey) ?? 0) + 1
    this.counters.set(counterKey, numero)

    const now = new Date().toISOString()
    const row: InvoiceRow = {
      ...invoice,
      id: `inv-${this.nextId++}`,
      numero,
      status: 'pending',
      attempts: 0,
      last_error: null,
      next_retry_at: null,
      provider_response: null,
      provider_document_id: null,
      pdf_url: null,
      xml_url: null,
      cdr_url: null,
      sunat_description: null,
      sunat_hash: null,
      qr_string: null,
      issued_at: null,
      created_at: now,
      updated_at: now,
    }
    this.rows.set(row.id, row)
    return { ...row }
  }

  async update(id: string, patch: Partial<InvoiceRow>): Promise<InvoiceRow> {
    const row = this.rows.get(id)
    if (!row) throw new Error(`Invoice ${id} not found`)
    const updated = { ...row, ...patch, updated_at: new Date().toISOString() }
    this.rows.set(id, updated)
    return { ...updated }
  }

  async getById(id: string): Promise<InvoiceRow | null> {
    const row = this.rows.get(id)
    return row ? { ...row } : null
  }
}
