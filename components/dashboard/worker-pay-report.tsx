'use client'

import { useMemo } from 'react'
import { AlertTriangle, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLanguage } from '@/context/language-context'
import type { Reservation, Service, Worker } from '@/context/dashboard-data-context'
import { downloadCsv, toCsv } from '@/lib/csv'
import { extraAmount, groupExtras, type ReservationExtra } from '@/lib/reservation-services'
import { countsAsServed, currentServicePct, formatMoney, summarizeEarnings, type EarningSummary, type PaySettings } from '@/lib/worker-pay'

// Analytics -> Pagos (scripts/114, lib/worker-pay.ts): what the owner owes
// each worker for the selected period. Same maths as the worker's own
// /mi-agenda, so both sides always see the same number.

interface Props {
  reservations: Reservation[]
  workers: Worker[]
  /** For each service's fixed commission (scripts/115). */
  services: Service[]
  /** Extra services of appointments with several (scripts/119). */
  extras: ReservationExtra[]
  from: Date
  to: Date
  currencySymbol: string
  tipWorkerPct: number
  excludesTax: boolean
  offHoursPct: number | null
  fileSlug: string
}

interface Line extends EarningSummary {
  worker: Worker
  pctLabel: string
}

export function WorkerPayReport({
  reservations,
  workers,
  services,
  extras,
  from,
  to,
  currencySymbol,
  tipWorkerPct,
  excludesTax,
  offHoursPct,
  fileSlug,
}: Props) {
  const { t } = useLanguage()
  const tr = t.pay
  const money = (n: number) => formatMoney(n, currencySymbol)

  const { lines, withoutWorker } = useMemo(() => {
    const now = new Date()
    const serviceCommission = new Map(services.map((s) => [s.id, s.worker_commission_pct ?? null]))
    const extrasByReservation = groupExtras(extras)
    const periodRows = reservations
      .filter((r) => {
        const start = new Date(r.start_time)
        return r.type !== 'visit' && start >= from && start <= to
      })
      .map((r) => ({
        ...r,
        service_commission_pct: r.service_id ? serviceCommission.get(r.service_id) ?? null : null,
        extra_lines: (extrasByReservation.get(r.id) ?? []).map((e) => ({
          price: extraAmount(e),
          commission_pct: serviceCommission.get(e.service_id) ?? null,
        })),
      }))
    const inRange = periodRows.filter((r) => r.worker_id)
    // Served appointments nobody was assigned to: their commission goes
    // to no one, so the owner should know they exist.
    const withoutWorker = periodRows.filter((r) => !r.worker_id && countsAsServed(r, now)).length
    const workerLines = workers
      .map((worker) => {
        const settings: PaySettings = {
          payType: worker.pay_type ?? null,
          commissionPct: worker.commission_pct ?? null,
          tipWorkerPct,
          excludesTax,
          offHoursPct,
        }
        const summary = summarizeEarnings(inRange.filter((r) => r.worker_id === worker.id), settings, now)
        const pct = currentServicePct(settings)
        const pctLabel = worker.pay_type === 'salary' ? tr.salary : pct === null ? tr.notSetUp : `${pct}%`
        return { ...summary, worker, pctLabel }
      })
    const lines: Line[] = workerLines
      .filter((l) => l.served > 0)
      .sort((a, b) => b.total - a.total)
    return { lines, withoutWorker }
  }, [reservations, workers, services, extras, from, to, tipWorkerPct, excludesTax, offHoursPct, tr.salary, tr.notSetUp])

  const totals = useMemo(
    () =>
      lines.reduce(
        (acc, l) => ({
          served: acc.served + l.served,
          sales: acc.sales + l.sales,
          serviceShare: acc.serviceShare + l.serviceShare,
          tips: acc.tips + l.tips,
          tipShare: acc.tipShare + l.tipShare,
          total: acc.total + l.total,
          businessShare: acc.businessShare + l.businessShare,
        }),
        { served: 0, sales: 0, serviceShare: 0, tips: 0, tipShare: 0, total: 0, businessShare: 0 }
      ),
    [lines]
  )
  const unconfigured = lines.filter((l) => l.unconfigured > 0).length

  const handleExport = () => {
    const fmt = (n: number) => n.toFixed(2)
    const csv = toCsv(lines, [
      { label: tr.colWorker, value: (l) => l.worker.name },
      { label: tr.colServed, value: (l) => l.served },
      { label: tr.colSales, value: (l) => fmt(l.sales) },
      { label: tr.colPct, value: (l) => l.pctLabel },
      { label: tr.colServiceShare, value: (l) => fmt(l.serviceShare) },
      { label: tr.colTips, value: (l) => fmt(l.tips) },
      { label: tr.colTipShare, value: (l) => fmt(l.tipShare) },
      { label: tr.colTotal, value: (l) => fmt(l.total) },
      { label: tr.colBusiness, value: (l) => fmt(l.businessShare) },
    ])
    const day = (d: Date) => d.toISOString().slice(0, 10)
    downloadCsv(`pagos-${fileSlug}-${day(from)}-${day(to)}.csv`, csv)
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="space-y-1.5">
          <CardTitle>{tr.reportTitle}</CardTitle>
          <CardDescription>{tr.reportDesc}</CardDescription>
        </div>
        {lines.length > 0 && (
          <Button variant="outline" size="sm" className="gap-2 self-start" onClick={handleExport}>
            <Download className="h-4 w-4" />
            {tr.export}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {unconfigured > 0 && (
          <p className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {tr.notSetUpWarning.replace('{n}', String(unconfigured))}
          </p>
        )}
        {withoutWorker > 0 && (
          <p className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {tr.noWorkerWarning.replace('{n}', String(withoutWorker))}
          </p>
        )}
        {lines.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{tr.empty}</p>
        ) : (
          <>
          {/* Phones: one card per worker instead of a 9-column table. */}
          <div className="space-y-3 sm:hidden">
            {lines.map((l) => (
              <div key={l.worker.id} className="rounded-lg border p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate font-medium">{l.worker.name}</p>
                  <p className="shrink-0 text-lg font-semibold tabular-nums">{money(l.total)}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {tr.colTotal} · {l.served} {tr.colServed.toLowerCase()} · {l.pctLabel}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">{tr.colSales}</dt>
                    <dd className="tabular-nums">{money(l.sales)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{tr.colServiceShare}</dt>
                    <dd className="tabular-nums">{money(l.serviceShare)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{tr.colTips}</dt>
                    <dd className="tabular-nums">{money(l.tips)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{tr.colTipShare}</dt>
                    <dd className="tabular-nums">{money(l.tipShare)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{tr.colBusiness}</dt>
                    <dd className="tabular-nums text-muted-foreground">{money(l.businessShare)}</dd>
                  </div>
                </dl>
              </div>
            ))}
            {lines.length > 1 && (
              <div className="flex items-baseline justify-between rounded-lg bg-muted px-3 py-2.5">
                <span className="font-semibold">{tr.totalsRow}</span>
                <span className="text-lg font-semibold tabular-nums">{money(totals.total)}</span>
              </div>
            )}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tr.colWorker}</TableHead>
                  <TableHead className="text-right">{tr.colServed}</TableHead>
                  <TableHead className="text-right">{tr.colSales}</TableHead>
                  <TableHead className="text-right">{tr.colPct}</TableHead>
                  <TableHead className="text-right">{tr.colServiceShare}</TableHead>
                  <TableHead className="text-right">{tr.colTips}</TableHead>
                  <TableHead className="text-right">{tr.colTipShare}</TableHead>
                  <TableHead className="text-right font-semibold">{tr.colTotal}</TableHead>
                  <TableHead className="text-right">{tr.colBusiness}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.worker.id}>
                    <TableCell className="font-medium">{l.worker.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.served}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(l.sales)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{l.pctLabel}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(l.serviceShare)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(l.tips)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(l.tipShare)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{money(l.total)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{money(l.businessShare)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {lines.length > 1 && (
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold">{tr.totalsRow}</TableCell>
                    <TableCell className="text-right tabular-nums">{totals.served}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(totals.sales)}</TableCell>
                    <TableCell />
                    <TableCell className="text-right tabular-nums">{money(totals.serviceShare)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(totals.tips)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(totals.tipShare)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{money(totals.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(totals.businessShare)}</TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
          </>
        )}
        <p className="text-xs text-muted-foreground">{tr.reportNote}</p>
      </CardContent>
    </Card>
  )
}
