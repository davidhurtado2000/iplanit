import {
  authorizeMember,
  buildDraftForReservation,
  CAN_CANCEL,
  cancelWithCreditNote,
  emitForReservation,
  isCreditNoteReason,
  json,
  loadInvoicingSetup,
  loadReservation,
  publicInvoice,
  reservationBlocker,
  retryInvoice,
} from '@/lib/invoicing/reservation-invoicing'
import { refreshDueInvoices } from '@/lib/invoicing/retry'
import type { ComprobanteKind } from '@/lib/invoicing/types'

// Invoicing for one reservation, used by the reservation modal.
// GET: whether it can be invoiced + its comprobantes.
// POST action=preview | emit | retry | credit_note.

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const businessId = params.get('business_id')
  const reservationId = params.get('reservation_id')
  const auth = await authorizeMember(businessId)
  if ('error' in auth) return auth.error
  if (!reservationId) return json({ error: 'missing_reservation_id' }, 400)

  const setup = await loadInvoicingSetup(auth.admin, businessId!, { requireEnabled: false })
  if (!setup.ok) return json({ available: false, reason: setup.code })

  const reservation = await loadReservation(auth.admin, businessId!, reservationId)
  if (!reservation) return json({ error: 'reservation_not_found' }, 404)

  const { data: stored } = await auth.admin
    .from('invoices')
    .select('*')
    .eq('reservation_id', reservationId)
    .order('created_at', { ascending: true })
  // Anything still waiting on SUNAT gets re-checked now instead of at the
  // next hourly run.
  const rows = await refreshDueInvoices(setup.setup, stored ?? [])

  return json({
    available: true,
    // Emission switched off: existing comprobantes still show, no new ones.
    canEmit: setup.setup.settings.enabled,
    environment: setup.setup.environment,
    blocker: reservationBlocker(reservation),
    requestedKind: reservation.invoice_type_requested,
    canCancel: CAN_CANCEL.includes(auth.role),
    invoices: rows.map(publicInvoice),
  })
}

type Body = {
  action?: 'preview' | 'emit' | 'retry' | 'credit_note'
  businessId?: string
  reservationId?: string
  invoiceId?: string
  kind?: ComprobanteKind
  amount?: number
  description?: string
  reasonCode?: string
}

export async function POST(request: Request) {
  const body = ((await request.json().catch(() => null)) ?? {}) as Body
  const auth = await authorizeMember(body.businessId, body.action === 'credit_note' ? CAN_CANCEL : undefined)
  if ('error' in auth) return auth.error
  const businessId = body.businessId!

  // Retrying or cancelling an existing comprobante must still work after the
  // owner switches new emissions off.
  const isNew = body.action === 'preview' || body.action === 'emit'
  const setupResult = await loadInvoicingSetup(auth.admin, businessId, { requireEnabled: isNew })
  if (!setupResult.ok) return json({ error: setupResult.code, message: setupResult.message }, 409)
  const setup = setupResult.setup

  if (body.action === 'preview' || body.action === 'emit') {
    if (!body.reservationId) return json({ error: 'missing_reservation_id' }, 400)
    const reservation = await loadReservation(auth.admin, businessId, body.reservationId)
    if (!reservation) return json({ error: 'reservation_not_found' }, 404)
    const blocker = reservationBlocker(reservation)
    if (blocker) return json({ error: blocker }, 409)

    const kind = body.kind === 'factura' || body.kind === 'boleta' ? body.kind : null
    const overrides = {
      amount: typeof body.amount === 'number' && body.amount > 0 ? body.amount : undefined,
      description: body.description?.trim() || undefined,
    }

    if (body.action === 'preview') {
      const result = await buildDraftForReservation({ admin: auth.admin, setup, reservation, kind, overrides })
      if (!result.ok) return json({ error: result.code, message: result.message, amount: result.amount }, 422)
      const d = result.draft
      return json({
        amount: result.amount,
        draft: {
          docType: d.docType,
          serie: d.serie,
          currency: d.currency,
          customer: d.customer,
          description: d.items[0]?.description,
          subtotal: d.subtotal,
          igv: d.igv,
          total: d.total,
        },
      })
    }

    const result = await emitForReservation({ admin: auth.admin, setup, reservation, kind, overrides, userId: auth.user.id })
    if (!result.ok) return json({ error: result.code, message: result.message }, 422)
    return json({ invoice: publicInvoice(result.invoice), reused: result.reused })
  }

  if (body.action === 'retry' || body.action === 'credit_note') {
    if (!body.invoiceId) return json({ error: 'missing_invoice_id' }, 400)
    const original = await setup.store.getById(body.invoiceId)
    if (!original || original.business_id !== businessId) return json({ error: 'invoice_not_found' }, 404)

    if (body.action === 'retry') {
      if (!['pending', 'sent', 'error'].includes(original.status)) return json({ error: 'not_retryable' }, 409)
      return json({ invoice: publicInvoice(await retryInvoice(setup, original)) })
    }

    if (original.doc_type === '07' || original.status !== 'accepted') return json({ error: 'not_cancellable' }, 409)
    const reasonCode = isCreditNoteReason(body.reasonCode) ? body.reasonCode : '01'
    const result = await cancelWithCreditNote({ setup, original, reasonCode, userId: auth.user.id })
    return json({ invoice: publicInvoice(result.invoice), reused: result.reused })
  }

  return json({ error: 'invalid_action' }, 400)
}
