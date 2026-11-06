import type { InvoiceCustomerDocType, InvoiceDocType, InvoicingProvider } from '@/lib/supabase/types'

export type { InvoiceCustomerDocType, InvoiceDocType, InvoicingProvider }

export type ComprobanteKind = 'boleta' | 'factura'
export type IgvAffectation = 'gravado' | 'exonerado' | 'inafecto'
export type Currency = 'PEN' | 'USD'

// One line of a comprobante, stored as-is in invoices.items so the document
// can be rebuilt exactly as it was sent.
export type InvoiceItem = {
  description: string
  quantity: number
  unitCode: 'ZZ' // SUNAT unit for services
  // Unit price without IGV, 6 decimals (what the provider calls valor unitario).
  unitValue: number
  // Unit price with IGV, 2 decimals.
  unitPrice: number
  // SUNAT catálogo 07: 10 gravado, 20 exonerado, 30 inafecto.
  igvAffectationCode: '10' | '20' | '30'
  igvRate: number
  subtotal: number
  igv: number
  total: number
}

export type InvoiceCustomer = {
  docType: InvoiceCustomerDocType
  docNumber: string | null
  name: string
  address: string | null
  email: string | null
}

export type DocumentRef = {
  docType: InvoiceDocType
  serie: string
  numero: number
}

// Everything needed to send a comprobante, minus its number (the number is
// reserved in the database right before sending).
export type InvoiceDraft = {
  docType: InvoiceDocType
  serie: string
  currency: Currency
  issueDate: string // YYYY-MM-DD in America/Lima
  customer: InvoiceCustomer
  items: InvoiceItem[]
  subtotal: number
  igv: number
  total: number
  // Credit notes only.
  related?: DocumentRef
  creditNoteReason?: { code: string; description: string }
}

export type ProviderDocument = InvoiceDraft & { numero: number }

export type ProviderResult =
  | {
      outcome: 'accepted' | 'pending' | 'rejected'
      providerDocumentId?: string | null
      pdfUrl?: string | null
      xmlUrl?: string | null
      cdrUrl?: string | null
      hash?: string | null
      qr?: string | null
      description?: string | null
      raw?: unknown
    }
  // The provider has no document with that series and number.
  | { outcome: 'not_found'; raw?: unknown }
  // The provider already has a document with that series and number (a
  // previous attempt got through even though we never saw the answer).
  | { outcome: 'duplicate'; raw?: unknown }

// Network failure or timeout: the document may or may not have reached the
// provider, so the next attempt must check its status before resending.
export class ProviderNetworkError extends Error {
  readonly retryable = true
  constructor(message: string) {
    super(message)
    this.name = 'ProviderNetworkError'
  }
}

// The provider refused the request itself (bad data, bad token). Retrying the
// same request won't help.
export class ProviderRequestError extends Error {
  readonly retryable = false
  constructor(message: string, readonly raw?: unknown) {
    super(message)
    this.name = 'ProviderRequestError'
  }
}

export type CompanyRegistration = {
  ruc: string
  razonSocial: string
  direccionFiscal: string | null
  ubigeo: string | null
}

export interface InvoiceProvider {
  readonly name: InvoicingProvider
  issueDocument(doc: ProviderDocument): Promise<ProviderResult>
  getStatus(ref: DocumentRef): Promise<ProviderResult>
  // Managed (reseller) model: creates the business as a company inside
  // iPlanit's account and returns its own token.
  registerCompany?(company: CompanyRegistration): Promise<{ companyId: string; token: string }>
}
