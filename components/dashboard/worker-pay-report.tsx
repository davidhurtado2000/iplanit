'use client'

import { useMemo } from 'react'
import { AlertTriangle, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLanguage } from '@/context/language-context'
import type { Reservation, Worker } from '@/context/dashboard-data-context'
import { downloadCsv, toCsv } from '@/lib/csv'
import { currentServicePct, formatMoney, summarizeEarnings, type EarningSummary, type PaySettings } from '@/lib/worker-pay'

// Analytics -> Pagos (scripts/114, lib/worker-pay.ts): what the owner owes
// each worker for the selected period. Same maths as the worker's own
// /mi-agenda, so both sides always see the same number.

interface Props {
  reservations: Reservation[]
  workers: Worker[]
  from: Date
  to: Date
  currencySymbol: string
  tipWorkerPct: number
  excludesTax: boolean
  fileSlug: string
}

interface Line extends EarningSummary {
  worker: Worker
  pctLabel: string
}

export function WorkerPayReport({ reservations, workers, from, to, currencySymbol, tipWorkerPct, excludesTax, fileSlug }: Props) {
  const { t } = useLanguage()
  const tr = t.pay
  const money = (n: number) => formatMoney(n, currencySymbol)

  const lines = useMemo<Line[]>(() => {
    const now = new Date()
    const inRange = reservations.filter((r) => {
      const start = new Date(r.start_time)
      return r.worker_id && r.type !== 'visit' && start >= from && start <= to
    })
    return workers
      .map((worker) => {
        const settings: PaySettings = {
          payType: worker.pay_type ?? null,
          commissionPct: worker.commission_pct ?? null,
          tipWorkerPct,
          excludesTax,
        }
        const summary = summarizeEarnings(inRange.filter((r) => r.worker_id === worker.id), settings, now)
        const pct = currentServicePct(settings)
        const pctLabel = worker.pay_type === 'salary' ? tr.salary : pct === null ? tr.notSetUp : `${pct}%`
        return { ...summary, worker, pctLabel }
      })
      .filter((l) => l.served > 0)
      .sort((a, b) => b.total - a.total)
  }, [reservations, workers, from, to, tipWorkerPct, excludesTax, tr.salary, tr.notSetUp])

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
        {lines.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{tr.empty}</p>
        ) : (
          <div className="overflow-x-auto">
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
        )}
        <p className="text-xs text-muted-foreground">{tr.reportNote}</p>
      </CardContent>
    </Card>
  )
}
