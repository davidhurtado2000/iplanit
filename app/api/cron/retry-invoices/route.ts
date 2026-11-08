import { NextResponse } from 'next/server'
import { createInvoicingAdminClient } from '@/lib/invoicing/service'
import { retryDueInvoices } from '@/lib/invoicing/retry'

// Finishes SUNAT comprobantes left 'pending'/'sent' (network failures, SUNAT
// still processing). Called hourly by .github/workflows/reminders-cron.yml,
// same CRON_SECRET check as app/api/cron/send-reminders. The reservation
// modal also re-checks its own comprobantes when opened, so most never wait
// for this.
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.error('[iplanit] CRON_SECRET is not set - refusing all requests')
    return NextResponse.json({ error: 'not_configured' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const summary = await retryDueInvoices(createInvoicingAdminClient())
    return NextResponse.json({ success: true, ...summary })
  } catch (err) {
    console.error('[iplanit] Invoice retry cron failed:', err)
    return NextResponse.json({ error: 'retry_failed' }, { status: 500 })
  }
}
