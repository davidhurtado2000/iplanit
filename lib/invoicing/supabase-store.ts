import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, InvoiceRow, Json } from '@/lib/supabase/types'
import type { InvoiceStore, NewInvoice } from './emit'

// InvoiceStore backed by Supabase. Needs a service-role client: invoices
// and the number counters are only writable by the service role (scripts/110).
export class SupabaseInvoiceStore implements InvoiceStore {
  private readonly db: SupabaseClient<Database>

  constructor(db: SupabaseClient<Database>) {
    this.db = db
  }

  // Reserves the next number and inserts the pending row in one transaction
  // (create_pending_invoice). Returns the existing live comprobante if the
  // reservation already has one.
  async createPending(invoice: NewInvoice): Promise<InvoiceRow> {
    const { data, error } = await this.db.rpc('create_pending_invoice', { p_invoice: invoice as unknown as Json })
    if (error || !data) throw new Error(`No se pudo crear el comprobante: ${error?.message ?? 'sin datos'}`)
    return data
  }

  async update(id: string, patch: Partial<InvoiceRow>): Promise<InvoiceRow> {
    const { data, error } = await this.db.from('invoices').update(patch).eq('id', id).select().single()
    if (error || !data) throw new Error(`No se pudo actualizar el comprobante ${id}: ${error?.message ?? 'sin datos'}`)
    return data
  }

  async getById(id: string): Promise<InvoiceRow | null> {
    const { data, error } = await this.db.from('invoices').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(`No se pudo leer el comprobante ${id}: ${error.message}`)
    return data
  }
}
