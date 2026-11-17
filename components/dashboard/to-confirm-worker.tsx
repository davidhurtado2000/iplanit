'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useLanguage } from '@/context/language-context'
import type { Client, Reservation, Service, Worker } from '@/context/dashboard-data-context'
import { createClient } from '@/lib/supabase/client'
import { markOwnReservationWrite } from '@/lib/own-actions'
import { capitalizeFirst } from '@/lib/utils'

// "Sin preferencia -> asignar y revisar" (scripts/116): bookings where the
// client didn't pick a barber and the system assigned a free one. A banner
// above the calendar counts them; the list lets reception confirm each (or
// all at once) or open the booking to change the barber.

interface Props {
  reservations: Reservation[]
  workers: Worker[]
  clients: Client[]
  services: Service[]
  timezone: string
  onOpenReservation: (reservation: Reservation) => void
  onChanged: () => void
}

export function ToConfirmWorker({ reservations, workers, clients, services, timezone, onOpenReservation, onChanged }: Props) {
  const { t, locale } = useLanguage()
  const tr = t.pay
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | 'all' | null>(null)

  const pending = useMemo(
    () =>
      reservations
        .filter((r) => (r.worker_auto_assigned || r.no_preference_pool) && (r.status === 'pending' || r.status === 'confirmed'))
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [reservations]
  )

  if (pending.length === 0) return null

  const confirm = async (ids: string[], busy: string) => {
    setBusyId(busy)
    try {
      markOwnReservationWrite()
      const { error } = await supabase.from('reservations').update({ worker_auto_assigned: false }).in('id', ids)
      if (error) throw error
      toast.success(tr.toConfirmDone)
      onChanged()
    } catch (error) {
      console.error('[iplanit] Error confirming workers:', error)
      toast.error(t.saveError)
    } finally {
      setBusyId(null)
    }
  }

  const fmt = (iso: string) => {
    const d = new Date(iso)
    const day = capitalizeFirst(d.toLocaleDateString(locale, { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short' }))
    const time = d.toLocaleTimeString(locale, { timeZone: timezone, hour: '2-digit', minute: '2-digit' })
    return `${day} · ${time}`
  }

  return (
    <>
      <div className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
          <UserCheck className="h-4 w-4 shrink-0" />
          {tr.toConfirmButton.replace('{n}', String(pending.length))}
        </p>
        <Button size="sm" variant="outline" className="w-full bg-background sm:w-auto" onClick={() => setOpen(true)}>
          {tr.toConfirmDialogTitle}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{tr.toConfirmDialogTitle}</DialogTitle>
            <DialogDescription>{tr.toConfirmDialogDesc}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {pending.map((r) => {
              const worker = workers.find((w) => w.id === r.worker_id)
              const client = clients.find((c) => c.id === r.client_id)
              const service = services.find((s) => s.id === r.service_id)
              return (
                <div key={r.id} className="space-y-2 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{client?.name ?? t.calendar.unknownClient}</p>
                    <p className="text-sm text-muted-foreground">{fmt(r.start_time)}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {service?.name ?? t.calendar.unknownService}
                      {r.no_preference_pool
                        ? ` · ${tr.poolNoBarber}`
                        : worker && ` · ${tr.toConfirmAssignedTo.replace('{name}', worker.name)}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!r.no_preference_pool && (
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={busyId !== null}
                        onClick={() => confirm([r.id], r.id)}
                      >
                        {busyId === r.id && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                        {tr.toConfirmConfirm}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={r.no_preference_pool ? 'default' : 'outline'}
                      className="flex-1"
                      disabled={busyId !== null}
                      onClick={() => {
                        setOpen(false)
                        onOpenReservation(r)
                      }}
                    >
                      {r.no_preference_pool ? tr.poolAssign : tr.toConfirmChange}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>

          {pending.filter((r) => !r.no_preference_pool).length > 1 && (
            <Button
              variant="secondary"
              disabled={busyId !== null}
              onClick={() => confirm(pending.filter((r) => !r.no_preference_pool).map((r) => r.id), 'all')}
            >
              {busyId === 'all' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tr.toConfirmAll}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
