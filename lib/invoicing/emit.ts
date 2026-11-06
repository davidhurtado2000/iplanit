import type { InvoiceRow, Json } from '@/lib/supabase/types'
import { CREDIT_NOTE_REASONS, type CreditNoteReasonCode } from './documents'
import {
  type DocumentRef,
  type InvoiceDraft,
  type InvoiceItem,
  type InvoiceProvider,
  type ProviderDocument,
  type ProviderResult,
  ProviderNetworkError,
  ProviderRequestError,
} from './types'

// Network failures are retried this many times in total, then the
// comprobante is marked 'error' for a person to look at.
export const MAX_ATTEMPTS = 5

// Minutes until the next try: 5, 10, 20, 40, 60 (capped).
export function retryDelayMinutes(attempt: number): number {
  return Math.min(5 * 2 ** Math.max(attempt - 1, 0), 60)
}

export type NewInvoice = Pick<
  InvoiceRow,
  | 'business_id'
  | 'ruc'
  | 'reservation_id'
  | 'doc_type'
  | 'serie'
  | 'related_invoice_id'
  | 'credit_note_reason'
  | 'customer_doc_type'
  | 'customer_doc_number'
  | 'customer_name'
  | 'customer_address'
  | 'customer_email'
  | 'items'
  | 'currency'
  | 'subtotal'
  | 'igv'
  | 'total'
  | 'environment'
  | 'issue_date'
  | 'created_by'
>

// Database access the orchestrator needs. The Supabase version calls the
// create_pending_invoice RPC (scripts/110); tests use lib/invoicing/memory-store.ts.
export interface InvoiceStore {
  // Reserves the next number for (ruc, serie) and inserts a 'pending' row in
  // one transaction. If the reservation already has a live factura/boleta,
  // returns that one instead of creating another.
  createPending(invoice: NewInvoice): Promise<InvoiceRow>
  update(id: string, patch: Partial<InvoiceRow>): Promise<InvoiceRow>
  getById(id: string): Promise<InvoiceRow | null>
}

export type EmitContext = {
  businessId: string
  ruc: string
  environment: 'demo' | 'production'
  reservationId: string | null
  relatedInvoiceId?: string | null
  createdBy: string | null
}

export function draftToNewInvoice(draft: InvoiceDraft, ctx: EmitContext): NewInvoice {
  return {
    business_id: ctx.businessId,
    ruc: ctx.ruc,
    reservation_id: ctx.reservationId,
    doc_type: draft.docType,
    serie: draft.serie,
    related_invoice_id: ctx.relatedInvoiceId ?? null,
    credit_note_reason: draft.creditNoteReason?.code ?? null,
    customer_doc_type: draft.customer.docType,
    customer_doc_number: draft.customer.docNumber,
    customer_name: draft.customer.name,
    customer_address: draft.customer.address,
    customer_email: draft.customer.email,
    items: draft.items as unknown as Json,
    currency: draft.currency,
    subtotal: draft.subtotal,
    igv: draft.igv,
    total: draft.total,
    environment: ctx.environment,
    issue_date: draft.issueDate,
    created_by: ctx.createdBy,
  }
}

// Rebuilds exactly what goes to the provider from the stored row, so every
// retry sends the same document with the same number.
export function rowToProviderDocument(row: InvoiceRow, related?: InvoiceRow | null): ProviderDocument {
  const doc: ProviderDocument = {
    docType: row.doc_type,
    serie: row.serie,
    numero: row.numero,
    currency: row.currency,
    issueDate: row.issue_date,
    customer: {
      docType: row.customer_doc_type,
      docNumber: row.customer_doc_number,
      name: row.customer_name,
      address: row.customer_address,
      email: row.customer_email,
    },
    items: row.items as unknown as InvoiceItem[],
    subtotal: Number(row.subtotal),
    igv: Number(row.igv),
    total: Number(row.total),
  }
  if (row.doc_type === '07') {
    if (!related) throw new Error('Credit note without its original comprobante')
    doc.related = { docType: related.doc_type, serie: related.serie, numero: related.numero }
    const code = (row.credit_note_reason ?? '01') as CreditNoteReasonCode
    doc.creditNoteReason = { code, description: CREDIT_NOTE_REASONS[code] ?? CREDIT_NOTE_REASONS['01'] }
  }
  return doc
}

function addMinutes(date: Date, minutes: number): string {
  return new Date(date.getTime() + minutes * 60_000).toISOString()
}

const FINAL_STATUSES = new Set(['accepted', 'rejected', 'voided'])

export type EmitResult = { invoice: InvoiceRow; reused: boolean }

// Emits a new comprobante. Safe to call twice for the same reservation: the
// second call gets the existing comprobante back instead of a new one.
export async function emitDraft(opts: {
  store: InvoiceStore
  provider: InvoiceProvider
  draft: InvoiceDraft
  ctx: EmitContext
  now: Date
}): Promise<EmitResult> {
  const row = await opts.store.createPending(draftToNewInvoice(opts.draft, opts.ctx))
  // Anything other than a fresh pending row means this reservation already had one.
  const reused = row.status !== 'pending' || row.attempts > 0
  const invoice = await sendInvoice({ store: opts.store, provider: opts.provider, invoice: row, now: opts.now })
  return { invoice, reused }
}

// Sends (or re-checks) one stored comprobante and records the outcome. Used
// by the first emission, the retry cron and the "Reintentar" button
// (manualRetry lets a person retry a comprobante already marked 'error').
export async function sendInvoice(opts: {
  store: InvoiceStore
  provider: InvoiceProvider
  invoice: InvoiceRow
  now: Date
  manualRetry?: boolean
}): Promise<InvoiceRow> {
  const { store, provider, invoice, now } = opts
  if (FINAL_STATUSES.has(invoice.status)) return invoice
  if (invoice.status === 'error' && !opts.manualRetry) return invoice

  const attempt = invoice.attempts + 1
  const ref: DocumentRef = { docType: invoice.doc_type, serie: invoice.serie, numero: invoice.numero }

  try {
    const related = invoice.related_invoice_id ? await store.getById(invoice.related_invoice_id) : null
    const doc = rowToProviderDocument(invoice, related)

    // A previous attempt may have reached the provider even if we never got
    // the answer (timeout). Ask first, so a retry never creates a duplicate.
    const mayExist = invoice.attempts > 0 || invoice.status === 'sent'
    let result: ProviderResult = mayExist ? await provider.getStatus(ref) : await provider.issueDocument(doc)
    if (result.outcome === 'not_found') result = await provider.issueDocument(doc)
    if (result.outcome === 'duplicate') result = await provider.getStatus(ref)
    if (result.outcome === 'not_found' || result.outcome === 'duplicate') {
      throw new ProviderNetworkError('El proveedor dio respuestas contradictorias sobre el comprobante')
    }

    return await applyResult(store, invoice, result, attempt, now)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    if (err instanceof ProviderRequestError || attempt >= MAX_ATTEMPTS) {
      return store.update(invoice.id, {
        status: 'error',
        attempts: attempt,
        last_error: message,
        next_retry_at: null,
        provider_response: (err instanceof ProviderRequestError ? err.raw : null) as Json,
      })
    }

    return store.update(invoice.id, {
      status: 'pending',
      attempts: attempt,
      last_error: message,
      next_retry_at: addMinutes(now, retryDelayMinutes(attempt)),
    })
  }
}

async function applyResult(
  store: InvoiceStore,
  invoice: InvoiceRow,
  result: Extract<ProviderResult, { outcome: 'accepted' | 'pending' | 'rejected' }>,
  attempt: number,
  now: Date,
): Promise<InvoiceRow> {
  const common: Partial<InvoiceRow> = {
    attempts: attempt,
    last_error: null,
    provider_response: (result.raw ?? null) as Json,
    provider_document_id: result.providerDocumentId ?? invoice.provider_document_id,
    pdf_url: result.pdfUrl ?? invoice.pdf_url,
    xml_url: result.xmlUrl ?? invoice.xml_url,
    cdr_url: result.cdrUrl ?? invoice.cdr_url,
    sunat_hash: result.hash ?? invoice.sunat_hash,
    qr_string: result.qr ?? invoice.qr_string,
    sunat_description: result.description ?? invoice.sunat_description,
  }

  if (result.outcome === 'accepted') {
    const updated = await store.update(invoice.id, {
      ...common,
      status: 'accepted',
      issued_at: now.toISOString(),
      next_retry_at: null,
    })
    // An accepted credit note cancels the original comprobante.
    if (invoice.doc_type === '07' && invoice.related_invoice_id) {
      await store.update(invoice.related_invoice_id, { status: 'voided' })
    }
    return updated
  }

  if (result.outcome === 'rejected') {
    return store.update(invoice.id, { ...common, status: 'rejected', next_retry_at: null })
  }

  // Received by the provider, still waiting for SUNAT: poll again later.
  return store.update(invoice.id, {
    ...common,
    status: 'sent',
    next_retry_at: addMinutes(now, retryDelayMinutes(attempt)),
  })
}
