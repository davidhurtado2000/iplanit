import {
  type DocumentRef,
  type InvoiceProvider,
  type ProviderDocument,
  type ProviderResult,
  ProviderNetworkError,
  ProviderRequestError,
} from '../types'

// What the next issueDocument call should do. Default: accept.
export type MockBehavior =
  | 'accept'
  | 'pending' // received, SUNAT hasn't answered yet
  | 'reject' // SUNAT rejected it
  | 'network_error' // never reached the provider
  | 'timeout_after_save' // reached the provider, but the answer was lost
  | 'request_error' // provider refused the request (bad data)

type Stored = { doc: ProviderDocument; status: 'accepted' | 'pending' | 'rejected' }

// In-memory stand-in for a real provider, for tests and local development
// without credentials. Behaves like Lucode on the parts that matter: it
// refuses a series+number it already has.
export class MockProvider implements InvoiceProvider {
  readonly name = 'mock' as const
  readonly documents = new Map<string, Stored>()
  readonly calls = { issue: 0, status: 0 }
  private queue: MockBehavior[] = []

  // Queue behaviors for the next issueDocument calls, in order.
  willDo(...behaviors: MockBehavior[]): this {
    this.queue.push(...behaviors)
    return this
  }

  // Simulates SUNAT answering later for a document left 'pending'.
  resolve(ref: DocumentRef, status: 'accepted' | 'rejected'): void {
    const stored = this.documents.get(key(ref))
    if (stored) stored.status = status
  }

  async issueDocument(doc: ProviderDocument): Promise<ProviderResult> {
    this.calls.issue++
    const behavior = this.queue.shift() ?? 'accept'

    if (behavior === 'network_error') throw new ProviderNetworkError('Mock: network error')
    if (behavior === 'request_error') throw new ProviderRequestError('Mock: invalid document', { field: 'items' })
    if (this.documents.has(key(doc))) return { outcome: 'duplicate' }

    const status = behavior === 'reject' ? 'rejected' : behavior === 'pending' ? 'pending' : 'accepted'
    this.documents.set(key(doc), { doc, status })

    if (behavior === 'timeout_after_save') throw new ProviderNetworkError('Mock: timeout')
    return result(doc, status)
  }

  async getStatus(ref: DocumentRef): Promise<ProviderResult> {
    this.calls.status++
    const stored = this.documents.get(key(ref))
    if (!stored) return { outcome: 'not_found' }
    return result(stored.doc, stored.status)
  }

  async registerCompany(company: { ruc: string }): Promise<{ companyId: string; token: string }> {
    return { companyId: `mock-${company.ruc}`, token: `mock-token-${company.ruc}` }
  }
}

function key(ref: DocumentRef): string {
  return `${ref.docType}-${ref.serie}-${ref.numero}`
}

function result(doc: ProviderDocument, status: Stored['status']): ProviderResult {
  const id = `${doc.serie}-${doc.numero}`
  return {
    outcome: status,
    providerDocumentId: id,
    pdfUrl: `https://mock.invalid/${id}.pdf`,
    xmlUrl: `https://mock.invalid/${id}.xml`,
    cdrUrl: status === 'accepted' ? `https://mock.invalid/${id}.cdr.zip` : null,
    hash: `hash-${id}`,
    description: status === 'rejected' ? 'Mock: rechazado por SUNAT' : null,
  }
}
