// Server-only: finishes comprobantes that didn't get a final answer on the
// first try (network failure, or SUNAT still processing).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, InvoiceRow } from '@/lib/supabase/types'
import { sendInvoice } from './emit'
import { loadInvoicingSetup, type InvoicingSetup } from './service'

// A 'pending' row with no retry scheduled means the request that created it
// died before sending (e.g. the function timed out). Give it this long
// before treating it as abandoned, so it never races the original request.
const ABANDONED_AFTER_MINUTES = 5

export function isDue(row: InvoiceRow, now: Date): boolean {
  if (row.status !== 'pending' && row.status !== 'sent') return false
  if (row.next_retry_at) return new Date(row.next_retry_at) <= now
  return now.getTime() - new Date(row.created_at).getTime() > ABANDONED_AFTER_MINUTES * 60_000
}

export async function retryDueInvoices(db: SupabaseClient<Database>, opts: { limit?: number; now?: Date } = {}) {
  const now = opts.now ?? new Date()
  const abandonedBefore = new Date(now.getTime() - ABANDONED_AFTER_MINUTES * 60_000).toISOString()

  const { data, error } = await db
    .from('invoices')
    .select('*')
    .in('status', ['pending', 'sent'])
    .or(`next_retry_at.lte.${now.toISOString()},and(next_retry_at.is.null,created_at.lt.${abandonedBefore})`)
    .order('created_at', { ascending: true })
    .limit(opts.limit ?? 50)
  if (error) throw new Error(`No se pudieron leer los comprobantes pendientes: ${error.message}`)

  const setups = new Map<string, InvoicingSetup | null>()
  const summary = { checked: 0, accepted: 0, rejected: 0, still_pending: 0, failed: 0, skipped: 0 }

  // Sequential on purpose: a handful per run, and it keeps the provider calls
  // for one RUC in order.
  for (const row of data ?? []) {
    if (!setups.has(row.business_id)) {
      const result = await loadInvoicingSetup(db, row.business_id, { requireEnabled: false })
      setups.set(row.business_id, result.ok ? result.setup : null)
    }
    const setup = setups.get(row.business_id)
    // Lost Premium or the token was removed: leave it for when it's back.
    if (!setup) {
      summary.skipped++
      continue
    }

    summary.checked++
    try {
      const updated = await sendInvoice({ store: setup.store, provider: setup.provider, invoice: row, now })
      if (updated.status === 'accepted') summary.accepted++
      else if (updated.status === 'rejected') summary.rejected++
      else if (updated.status === 'error') summary.failed++
      else summary.still_pending++
    } catch (err) {
      summary.failed++
      console.error('[iplanit] Invoice retry failed', row.id, err)
    }
  }

  return summary
}

// Used when someone opens a reservation: re-checks its own due comprobantes
// right away instead of waiting for the hourly job.
export async function refreshDueInvoices(
  setup: InvoicingSetup,
  rows: InvoiceRow[],
  now: Date = new Date(),
): Promise<InvoiceRow[]> {
  return Promise.all(
    rows.map((row) =>
      isDue(row, now)
        ? sendInvoice({ store: setup.store, provider: setup.provider, invoice: row, now }).catch(() => row)
        : row,
    ),
  )
}
