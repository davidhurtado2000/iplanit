// Server-only: the actions behind the invoicing section of the reservation
// modal (preview, emit, retry, cancel with a credit note). Each one checks
// the caller's role, the plan and the reservation before touching anything.
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Database, InvoiceRow } from '@/lib/supabase/types'
import { getBusinessEmailsByReservation, getResendClient, NOTIFICATIONS_FROM_EMAIL } from '@/lib/email/resend'
import { buildInvoiceEmail } from '@/lib/email/templates'
import { buildCreditNoteDraft, buildReservationDraft, type DraftResult } from './build-draft'
import { CREDIT_NOTE_REASONS, type CreditNoteReasonCode } from './documents'
import { emitDraft, sendInvoice } from './emit'
import { createInvoicingAdminClient, emitContext, loadInvoicingSetup, type InvoicingSetup } from './service'
import type { ComprobanteKind, InvoiceItem } from './types'

type Role = 'owner' | 'admin' | 'sales'
const CAN_EMIT: Role[] = ['owner', 'admin', 'sales']
const CAN_CANCEL: Role[] = ['owner', 'admin']

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status })

// Signed-in user with one of the allowed roles on the business.
export async function authorizeMember(businessId: string | null | undefined, allowed: Role[] = CAN_EMIT) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: json({ error: 'not_authenticated' }, 401) }
  if (!businessId) return { error: json({ error: 'missing_business_id' }, 400) }
  const { data: role } = await supabase.rpc('business_member_role', { target_business_id: businessId })
  if (!role || !allowed.includes(role as Role)) return { error: json({ error: 'forbidden' }, 403) }
  return { user, role: role as Role, admin: createInvoicingAdminClient() }
}

export { CAN_CANCEL }

type ReservationData = {
  id: string
  business_id: string
  client_id: string
  start_time: string
  status: string
  type: string
  price: number | null
  price_usd: number | null
  payment_method: string | null
  invoice_type_requested: 'boleta' | 'factura' | null
  service_id: string | null
}

export async function loadReservation(admin: SupabaseClient<Database>, businessId: string, reservationId: string) {
  const { data } = await admin
    .from('reservations')
    .select('id, business_id, client_id, start_time, status, type, price, price_usd, payment_method, invoice_type_requested, service_id')
    .eq('id', reservationId)
    .eq('business_id', businessId)
    .maybeSingle()
  return (data as ReservationData | null) ?? null
}

// Only a completed, paid booking can be invoiced.
export function reservationBlocker(r: ReservationData): string | null {
  if (r.type === 'visit') return 'is_visit'
  if (r.status !== 'completed') return 'not_completed'
  if (!r.payment_method) return 'not_paid'
  return null
}

export async function buildDraftForReservation(opts: {
  admin: SupabaseClient<Database>
  setup: InvoicingSetup
  reservation: ReservationData
  kind: ComprobanteKind | null
  overrides?: { amount?: number; description?: string }
}): Promise<DraftResult & { amount: number | null }> {
  const { admin, reservation } = opts
  const [{ data: business }, { data: client }, { data: service }] = await Promise.all([
    admin.from('businesses').select('currency').eq('id', reservation.business_id).single(),
    admin
      .from('clients')
      .select('name, email, document_type, document_number, fiscal_name, fiscal_address')
      .eq('id', reservation.client_id)
      .maybeSingle(),
    reservation.service_id
      ? admin.from('services').select('name').eq('id', reservation.service_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const currency = business?.currency === 'USD' ? 'USD' : 'PEN'
  const price = currency === 'USD' ? reservation.price_usd : reservation.price
  // The amount as the business enters prices (with or without IGV, per its
  // settings) - what the editable field in the preview starts from.
  const amount = opts.overrides?.amount ?? price
  const result = buildReservationDraft({
    kind: opts.kind ?? reservation.invoice_type_requested,
    settings: opts.setup.draftSettings,
    currency,
    reservation: {
      startTime: reservation.start_time,
      price,
    },
    serviceName: (service as { name?: string } | null)?.name ?? 'Servicio',
    client: client
      ? {
          name: client.name,
          email: client.email,
          documentType: client.document_type,
          documentNumber: client.document_number,
          fiscalName: client.fiscal_name,
          fiscalAddress: client.fiscal_address,
        }
      : null,
    overrides: opts.overrides,
    now: new Date(),
  })
  return { ...result, amount }
}

export async function emitForReservation(opts: {
  admin: SupabaseClient<Database>
  setup: InvoicingSetup
  reservation: ReservationData
  kind: ComprobanteKind | null
  overrides?: { amount?: number; description?: string }
  userId: string
}) {
  const result = await buildDraftForReservation(opts)
  if (!result.ok) return { ok: false as const, code: result.code, message: result.message }
  const emitted = await emitDraft({
    store: opts.setup.store,
    provider: opts.setup.provider,
    draft: result.draft,
    ctx: emitContext(opts.setup, {
      businessId: opts.reservation.business_id,
      reservationId: opts.reservation.id,
      createdBy: opts.userId,
    }),
    now: new Date(),
  })
  return { ok: true as const, ...emitted }
}

export async function retryInvoice(setup: InvoicingSetup, invoice: InvoiceRow) {
  return sendInvoice({ store: setup.store, provider: setup.provider, invoice, now: new Date(), manualRetry: true })
}

// Cancels an accepted factura/boleta with a credit note for the full amount.
export async function cancelWithCreditNote(opts: {
  setup: InvoicingSetup
  original: InvoiceRow
  reasonCode: CreditNoteReasonCode
  userId: string
}) {
  const { original, setup } = opts
  const draft = buildCreditNoteDraft(
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
      subtotal: Number(original.subtotal),
      igv: Number(original.igv),
      total: Number(original.total),
    },
    setup.draftSettings,
    opts.reasonCode,
    new Date(),
  )
  return emitDraft({
    store: setup.store,
    provider: setup.provider,
    draft,
    ctx: emitContext(setup, {
      businessId: original.business_id,
      reservationId: original.reservation_id,
      relatedInvoiceId: original.id,
      createdBy: opts.userId,
    }),
    now: new Date(),
  })
}

const DOC_LABEL = { es: { '01': 'Factura', '03': 'Boleta', '07': 'Nota de crédito' }, en: { '01': 'Factura', '03': 'Boleta', '07': 'Credit note' } }

// Emails the comprobante's PDF link to the customer. Recipient: the email
// captured on the comprobante, or the client's current one if it was added
// later.
export async function emailInvoice(
  admin: SupabaseClient<Database>,
  invoice: InvoiceRow,
): Promise<{ ok: true; to: string } | { ok: false; error: 'no_email' | 'send_failed' }> {
  const [{ data: business }, reservation] = await Promise.all([
    admin.from('businesses').select('name, country').eq('id', invoice.business_id).single(),
    invoice.reservation_id ? loadReservation(admin, invoice.business_id, invoice.reservation_id) : Promise.resolve(null),
  ])
  let to = invoice.customer_email
  if (!to && reservation) {
    const { data: client } = await admin.from('clients').select('email').eq('id', reservation.client_id).maybeSingle()
    to = client?.email ?? null
  }
  if (!to) return { ok: false, error: 'no_email' }

  const language = business?.country === 'US' ? 'en' : 'es'
  const { subject, html } = buildInvoiceEmail({
    clientName: invoice.customer_name,
    businessName: business?.name ?? '',
    documentLabel: `${DOC_LABEL[language][invoice.doc_type]} ${invoice.serie}-${invoice.numero}`,
    total: `${invoice.currency === 'USD' ? '$' : 'S/'} ${Number(invoice.total).toFixed(2)}`,
    issueDate: invoice.issue_date.split('-').reverse().join('/'),
    pdfUrl: invoice.pdf_url!,
    language,
  })

  try {
    const replyTo = invoice.reservation_id
      ? (await getBusinessEmailsByReservation(admin, [invoice.reservation_id])).get(invoice.reservation_id)
      : undefined
    await getResendClient().emails.send({ from: NOTIFICATIONS_FROM_EMAIL, to, replyTo, subject, html })
    return { ok: true, to }
  } catch (err) {
    console.error('[iplanit] Error emailing comprobante', invoice.id, err)
    return { ok: false, error: 'send_failed' }
  }
}

export function isCreditNoteReason(code: unknown): code is CreditNoteReasonCode {
  return typeof code === 'string' && code in CREDIT_NOTE_REASONS
}

// What the modal shows for each comprobante (no raw provider payloads).
export function publicInvoice(row: InvoiceRow) {
  return {
    id: row.id,
    docType: row.doc_type,
    serie: row.serie,
    numero: row.numero,
    status: row.status,
    environment: row.environment,
    total: Number(row.total),
    currency: row.currency,
    customerName: row.customer_name,
    customerDocNumber: row.customer_doc_number,
    pdfUrl: row.pdf_url,
    xmlUrl: row.xml_url,
    cdrUrl: row.cdr_url,
    relatedInvoiceId: row.related_invoice_id,
    lastError: row.last_error,
    sunatDescription: row.sunat_description,
    issueDate: row.issue_date,
    createdAt: row.created_at,
  }
}

export { loadInvoicingSetup }
