'use client'

import { Clock, StickyNote } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'

// Detail of one appointment in the worker portal (/mi-agenda): who, what,
// when, the FULL notes and - when the business set up their pay - their
// share. Read-only. Deliberately no client phone/email/history: the portal
// never exposes more about a client than the name and the appointment's own
// notes (scripts/104).

export interface AppointmentDetailData {
  client: string
  /** The main service followed by the extra ones. */
  services: string[]
  /** "Martes, 18 de noviembre" */
  dateLabel: string
  /** "15:00 – 15:45" */
  timeLabel: string
  durationLabel: string
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  isVisit: boolean
  notes: string | null
  offHours: boolean
  /** Only when the business set up this worker's pay and the appointment counts. */
  share: { services: string; tip: string | null; total: string } | null
  /** Only when the business lets workers see what was charged. */
  charged: string | null
}

export function AppointmentDetail({
  data,
  open,
  onOpenChange,
}: {
  data: AppointmentDetailData | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useLanguage()
  const tr = t.workerPortal

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        {data && (
          <>
            <DialogHeader>
              <DialogTitle className={cn(data.status === 'cancelled' && 'line-through')}>{data.client}</DialogTitle>
              <DialogDescription>{tr.detailTitle}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-medium',
                    data.status === 'confirmed' && 'bg-primary/10 text-primary',
                    data.status === 'completed' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                    data.status === 'pending' && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
                    (data.status === 'cancelled' || data.status === 'no_show') && 'bg-muted text-muted-foreground'
                  )}
                >
                  {tr.status[data.status]}
                </span>
                {data.offHours && (
                  <span className="rounded-full bg-violet-500/10 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300">
                    {t.pay.offHoursBadge}
                  </span>
                )}
              </div>

              <dl className="space-y-3">
                <div>
                  <dt className="text-xs text-muted-foreground">{data.services.length > 1 ? tr.detailServices : tr.detailService}</dt>
                  <dd className="mt-0.5 font-medium">
                    {data.services.length > 0 ? (
                      <ul className="space-y-0.5">
                        {data.services.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    ) : data.isVisit ? (
                      tr.visit
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{tr.detailWhen}</dt>
                  <dd className="mt-0.5 flex flex-wrap items-center gap-x-2 font-medium">
                    <span>{data.dateLabel}</span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {data.timeLabel} · {data.durationLabel}
                    </span>
                  </dd>
                </div>
              </dl>

              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <StickyNote className="h-3.5 w-3.5" />
                  {tr.detailNotes}
                </p>
                {data.notes ? (
                  <p className="whitespace-pre-wrap leading-relaxed">{data.notes}</p>
                ) : (
                  <p className="text-muted-foreground">{tr.detailNoNotes}</p>
                )}
              </div>

              {data.share && (
                <div className="space-y-1 rounded-lg border p-3">
                  <p className="text-xs font-medium text-muted-foreground">{tr.detailYourShare}</p>
                  <div className="flex justify-between">
                    <span>{t.pay.portalServices}</span>
                    <span className="font-medium tabular-nums">{data.share.services}</span>
                  </div>
                  {data.share.tip && (
                    <div className="flex justify-between">
                      <span>{t.pay.portalTips}</span>
                      <span className="font-medium tabular-nums">{data.share.tip}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-1 font-semibold text-emerald-700 dark:text-emerald-400">
                    <span>{tr.detailTotal}</span>
                    <span className="tabular-nums">{data.share.total}</span>
                  </div>
                </div>
              )}

              {data.charged && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t.pay.portalSales}</span>
                  <span className="font-medium tabular-nums">{data.charged}</span>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
