import { NextResponse } from 'next/server'
import { authorizeMember, json, ticketUrlOf } from '@/lib/invoicing/reservation-invoicing'

// The comprobante's 72 mm ticket PDF, served from iPlanit's own origin so
// the reservation modal can send it straight to the browser's print dialog
// (a PDF from another site can't be printed from script). Any member who
// can emit can print.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const businessId = params.get('business_id')
  const invoiceId = params.get('invoice_id')
  const auth = await authorizeMember(businessId)
  if ('error' in auth) return auth.error
  if (!invoiceId) return json({ error: 'missing_invoice_id' }, 400)

  const { data: invoice } = await auth.admin
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq('business_id', businessId!)
    .maybeSingle()
  if (!invoice) return json({ error: 'invoice_not_found' }, 404)

  const url = ticketUrlOf(invoice)
  if (!url) return json({ error: 'no_ticket' }, 404)

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return json({ error: 'provider_error' }, 502)
    return new NextResponse(await res.arrayBuffer(), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${invoice.serie}-${invoice.numero}.pdf"`,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch {
    return json({ error: 'provider_unreachable' }, 502)
  }
}
