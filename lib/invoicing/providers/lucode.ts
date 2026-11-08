import {
  type DocumentRef,
  type InvoiceDocType,
  type InvoiceProvider,
  type ProviderDocument,
  type ProviderResult,
  ProviderNetworkError,
  ProviderRequestError,
} from '../types'

// Lucode's API SUNAT (docs.apisunat.pe). One token per company (RUC); the
// same token works in both environments, so the environment alone decides
// whether a comprobante reaches SUNAT.
export const LUCODE_URLS = {
  demo: 'https://sandbox.apisunat.pe', // same validations as SUNAT, never sent
  production: 'https://app.apisunat.pe', // real comprobantes
} as const

const TIMEOUT_MS = 25_000

const DOCUMENTO: Record<InvoiceDocType, string> = {
  '01': 'factura',
  '03': 'boleta',
  '07': 'nota_credito',
}

const TRIBUTO: Record<'10' | '20' | '30', string> = { '10': 'IGV', '20': 'EXO', '30': 'INA' }

type LucodeResponse = {
  success?: boolean
  message?: string
  payload?: {
    estado?: string
    hash?: string | null
    xml?: string | null
    cdr?: string | null
    pdf?: { ticket?: string | null; a4?: string | null } | null
  } | null
}

// Builds the request body Lucode expects. Exported for tests.
export function toLucodeBody(doc: ProviderDocument): Record<string, unknown> {
  // A boleta without an identified customer goes as "CLIENTE VARIOS" with
  // the placeholder DNI 99999999 (docs: boleta-sin-dni).
  const anonymous = doc.customer.docType === '-' || !doc.customer.docNumber
  const body: Record<string, unknown> = {
    documento: DOCUMENTO[doc.docType],
    serie: doc.serie,
    numero: doc.numero,
    fecha_de_emision: doc.issueDate,
    moneda: doc.currency,
    cliente_tipo_de_documento: anonymous ? '1' : doc.customer.docType,
    cliente_numero_de_documento: anonymous ? '99999999' : doc.customer.docNumber,
    cliente_denominacion: anonymous ? 'CLIENTE VARIOS' : doc.customer.name,
    cliente_direccion: doc.customer.address || '-',
    items: doc.items.map((item) => ({
      unidad_de_medida: item.unitCode,
      descripcion: item.description,
      cantidad: String(item.quantity),
      valor_unitario: item.unitValue.toFixed(6),
      porcentaje_igv: item.igvAffectationCode === '10' ? String(item.igvRate) : '0',
      codigo_tipo_afectacion_igv: item.igvAffectationCode,
      nombre_tributo: TRIBUTO[item.igvAffectationCode],
    })),
    total: doc.total.toFixed(2),
  }

  if (doc.docType === '07') {
    if (!doc.related || !doc.creditNoteReason) throw new ProviderRequestError('Nota de crédito sin comprobante afectado')
    body.nota_credito_codigo_tipo = doc.creditNoteReason.code
    body.nota_credito_motivo = doc.creditNoteReason.description
    body.documento_afectado = {
      documento: DOCUMENTO[doc.related.docType],
      serie: doc.related.serie,
      numero: doc.related.numero,
    }
  } else {
    body.tipo_operacion = '0101' // venta interna
    // Services are paid at once, so the due date is the issue date.
    if (doc.docType === '01') body.fecha_de_vencimiento = doc.issueDate
  }

  return body
}

// Maps a 200 answer to our outcome. Lucode answers success:true even when
// SUNAT rejected the document, so the estado is what counts.
export function fromLucodeResponse(data: LucodeResponse, ref: DocumentRef): ProviderResult {
  const p = data.payload ?? {}
  const estado = (p.estado ?? '').toUpperCase()
  const outcome =
    estado === 'ACEPTADO' ? 'accepted' : estado === 'RECHAZADO' ? 'rejected' : estado === 'PENDIENTE' ? 'pending' : null
  if (!outcome) throw new ProviderNetworkError(`Respuesta inesperada de Lucode: ${data.message ?? 'sin estado'}`)

  return {
    outcome,
    providerDocumentId: `${ref.serie}-${ref.numero}`,
    pdfUrl: p.pdf?.a4 ?? p.pdf?.ticket ?? null,
    xmlUrl: p.xml ?? null,
    cdrUrl: p.cdr ?? null,
    hash: p.hash ?? null,
    description: outcome === 'rejected' ? (data.message ?? 'Rechazado por SUNAT') : null,
    raw: data,
  }
}

const isDuplicate = (message: string) => /emitid[oa] anteriormente/i.test(message)
const isNotFound = (message: string) => /no existe|no se encuentra registrad/i.test(message)

export class LucodeProvider implements InvoiceProvider {
  readonly name = 'lucode' as const

  constructor(
    private readonly opts: { token: string; environment: keyof typeof LUCODE_URLS; fetchImpl?: typeof fetch },
  ) {}

  async issueDocument(doc: ProviderDocument): Promise<ProviderResult> {
    return this.call('/api/v3/documents', toLucodeBody(doc), doc)
  }

  async getStatus(ref: DocumentRef): Promise<ProviderResult> {
    return this.call('/api/v3/status', { documento: DOCUMENTO[ref.docType], serie: ref.serie, numero: ref.numero }, ref)
  }

  private async call(path: string, body: unknown, ref: DocumentRef): Promise<ProviderResult> {
    const fetchImpl = this.opts.fetchImpl ?? fetch
    let res: Response
    try {
      res = await fetchImpl(`${LUCODE_URLS[this.opts.environment]}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.opts.token}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (err) {
      // Timeout or connection failure: the document may or may not have
      // arrived, so the caller checks the status before resending.
      throw new ProviderNetworkError(`Lucode no respondió: ${err instanceof Error ? err.message : String(err)}`)
    }

    const data = (await res.json().catch(() => ({}))) as LucodeResponse
    const message = data.message ?? `HTTP ${res.status}`

    if (res.ok) return fromLucodeResponse(data, ref)
    if (res.status === 400 && isDuplicate(message)) return { outcome: 'duplicate', raw: data }
    if (res.status === 400 && isNotFound(message)) return { outcome: 'not_found', raw: data }
    if (res.status === 429 || res.status >= 500) throw new ProviderNetworkError(`Lucode: ${message}`)
    // 401 bad token, 400/422 invalid data: retrying the same request won't help.
    throw new ProviderRequestError(`Lucode: ${message}`, data)
  }
}
