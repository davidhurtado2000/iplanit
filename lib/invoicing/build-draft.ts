import { buildLine, round2, sumLines } from './calculate'
import {
  CREDIT_NOTE_REASONS,
  type CreditNoteReasonCode,
  isValidRuc,
  limaDate,
  limaDateDisplay,
  toSunatDocument,
} from './documents'
import type { ComprobanteKind, Currency, IgvAffectation, InvoiceCustomer, InvoiceDraft, InvoiceItem } from './types'
import type { InvoiceDocType } from './types'

// SUNAT: a boleta whose total is above S/ 700 must identify the customer.
export const BOLETA_ID_THRESHOLD_PEN = 700

export type DraftSettings = {
  serieBoleta: string
  serieFactura: string
  serieNcBoleta: string
  serieNcFactura: string
  pricesIncludeIgv: boolean
  igvRate: number
  igvAffectation: IgvAffectation
}

export type DraftClient = {
  name: string
  email: string | null
  documentType: string | null
  documentNumber: string | null
  fiscalName: string | null
  fiscalAddress: string | null
}

export type DraftInput = {
  // What the client asked for (reservations.invoice_type_requested); null = boleta.
  kind: ComprobanteKind | null
  settings: DraftSettings
  currency: Currency
  // Needed only for USD comprobantes, to apply the S/ 700 rule.
  usdToPen?: number
  reservation: { startTime: string; price: number | null }
  serviceName: string
  client: DraftClient | null
  // Edits made in the preview before emitting (discounts, adjustments).
  overrides?: {
    amount?: number
    description?: string
  }
  now: Date
}

export type DraftErrorCode =
  | 'no_amount'
  | 'factura_requires_ruc'
  | 'factura_requires_name'
  | 'boleta_requires_document'
  | 'exchange_rate_required'

export type DraftResult = { ok: true; draft: InvoiceDraft } | { ok: false; code: DraftErrorCode; message: string }

const ERROR_MESSAGES: Record<DraftErrorCode, string> = {
  no_amount: 'La reserva no tiene un monto para facturar.',
  factura_requires_ruc: 'Para emitir una factura, el cliente necesita un RUC válido.',
  factura_requires_name: 'Para emitir una factura, el cliente necesita su razón social.',
  boleta_requires_document: 'Las boletas de más de S/ 700 necesitan el DNI del cliente.',
  exchange_rate_required: 'Falta el tipo de cambio para validar una boleta en dólares.',
}

function fail(code: DraftErrorCode): DraftResult {
  return { ok: false, code, message: ERROR_MESSAGES[code] }
}

// Builds the comprobante for a completed reservation. Pure: no database, no
// network. All validation happens here, BEFORE a correlative is reserved, so
// a rejected draft never burns a number.
export function buildReservationDraft(input: DraftInput): DraftResult {
  const amount = input.overrides?.amount ?? input.reservation.price
  if (amount == null || !(amount > 0)) return fail('no_amount')

  const kind: ComprobanteKind = input.kind ?? 'boleta'
  const client = input.client
  const document = client ? toSunatDocument(client.documentType, client.documentNumber) : null

  const description =
    input.overrides?.description?.trim() ||
    `${input.serviceName} - ${limaDateDisplay(new Date(input.reservation.startTime))}`

  const item = buildLine({
    description,
    amount,
    pricesIncludeIgv: input.settings.pricesIncludeIgv,
    igvRate: input.settings.igvRate,
    affectation: input.settings.igvAffectation,
  })
  const totals = sumLines([item])

  let customer: InvoiceCustomer
  let docType: InvoiceDocType
  let serie: string

  if (kind === 'factura') {
    if (!document || document.docType !== '6' || !isValidRuc(document.docNumber)) return fail('factura_requires_ruc')
    const name = (client?.fiscalName ?? '').trim() || (client?.documentType === 'ruc' ? (client?.name ?? '').trim() : '')
    if (!name) return fail('factura_requires_name')
    customer = {
      docType: '6',
      docNumber: document.docNumber,
      name,
      address: client?.fiscalAddress?.trim() || null,
      email: client?.email ?? null,
    }
    docType = '01'
    serie = input.settings.serieFactura
  } else {
    let totalPen = totals.total
    if (input.currency === 'USD') {
      if (!input.usdToPen || !(input.usdToPen > 0)) return fail('exchange_rate_required')
      totalPen = round2(totals.total * input.usdToPen)
    }
    if (!document && totalPen > BOLETA_ID_THRESHOLD_PEN) return fail('boleta_requires_document')

    customer = document
      ? {
          docType: document.docType,
          docNumber: document.docNumber,
          name: (document.docType === '6' && client?.fiscalName?.trim()) || client?.name?.trim() || 'CLIENTES VARIOS',
          address: client?.fiscalAddress?.trim() || null,
          email: client?.email ?? null,
        }
      : {
          docType: '-',
          docNumber: null,
          name: client?.name?.trim() || 'CLIENTES VARIOS',
          address: null,
          email: client?.email ?? null,
        }
    docType = '03'
    serie = input.settings.serieBoleta
  }

  return {
    ok: true,
    draft: {
      docType,
      serie,
      currency: input.currency,
      issueDate: limaDate(input.now),
      customer,
      items: [item],
      ...totals,
    },
  }
}

export type OriginalInvoice = {
  docType: InvoiceDocType
  serie: string
  numero: number
  currency: Currency
  customer: InvoiceCustomer
  items: InvoiceItem[]
  subtotal: number
  igv: number
  total: number
}

// Credit note that cancels a whole factura/boleta: same customer, same items,
// same totals, pointing at the original. Uses the credit-note series that
// matches the original (F... for facturas, B... for boletas).
export function buildCreditNoteDraft(
  original: OriginalInvoice,
  settings: Pick<DraftSettings, 'serieNcBoleta' | 'serieNcFactura'>,
  reasonCode: CreditNoteReasonCode,
  now: Date,
): InvoiceDraft {
  if (original.docType === '07') throw new Error('A credit note cannot be cancelled with another credit note')
  return {
    docType: '07',
    serie: original.docType === '01' ? settings.serieNcFactura : settings.serieNcBoleta,
    currency: original.currency,
    issueDate: limaDate(now),
    customer: original.customer,
    items: original.items,
    subtotal: original.subtotal,
    igv: original.igv,
    total: original.total,
    related: { docType: original.docType, serie: original.serie, numero: original.numero },
    creditNoteReason: { code: reasonCode, description: CREDIT_NOTE_REASONS[reasonCode] },
  }
}
