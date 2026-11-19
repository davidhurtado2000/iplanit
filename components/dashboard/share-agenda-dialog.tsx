'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Copy, FileDown, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useBusinesses } from '@/hooks/use-businesses'
import { useLanguage } from '@/context/language-context'
import { useDashboardData } from '@/context/dashboard-data-context'
import { buildAgendaHtml, buildAgendaText, type AgendaInput } from '@/lib/agenda-share'
import { groupExtras, serviceLabel } from '@/lib/reservation-services'
import { toDateStr } from '@/lib/timezone'

// "Compartir agenda": a day's appointments as complete text for WhatsApp, or
// as a PDF, instead of a screenshot that cuts off. Everything comes from data
// the calendar already loaded.
export function ShareAgendaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t, locale } = useLanguage()
  const { currentBusiness } = useBusinesses()
  const { reservations, clients, services, workers, reservationExtras, ensureReservationsInRange } = useDashboardData()
  const tz = currentBusiness?.timezone || 'America/Lima'
  const s = t.calendar

  const dayFromToday = (offset: number) => toDateStr(new Date(Date.now() + offset * 86_400_000), tz)
  const [date, setDate] = useState(() => dayFromToday(1))
  const [workerId, setWorkerId] = useState('all')
  const [showEnd, setShowEnd] = useState(false)
  const [edited, setEdited] = useState<string | null>(null)

  // Opening it again starts from tomorrow, the usual use (sending the next
  // day's agenda at closing time).
  useEffect(() => {
    if (open) {
      setDate(toDateStr(new Date(Date.now() + 86_400_000), tz))
      setWorkerId('all')
      setEdited(null)
    }
  }, [open, tz])

  // Make sure that day's reservations are loaded (the calendar loads a window).
  useEffect(() => {
    if (!open || !date) return
    const from = new Date(`${date}T00:00:00Z`)
    from.setUTCDate(from.getUTCDate() - 1)
    const to = new Date(`${date}T00:00:00Z`)
    to.setUTCDate(to.getUTCDate() + 2)
    void ensureReservationsInRange(from, to)
  }, [open, date, ensureReservationsInRange])

  const activeWorkers = useMemo(() => workers.filter((w) => w.is_active), [workers])
  const input: AgendaInput = useMemo(() => {
    const extrasByReservation = groupExtras(reservationExtras)
    const clientById = new Map(clients.map((c) => [c.id, c.name]))
    const serviceById = new Map(services.map((svc) => [svc.id, svc.name]))
    return {
      date,
      timezone: tz,
      locale,
      reservations: reservations.filter(
        (r) =>
          (!currentBusiness || r.business_id === currentBusiness.id) &&
          (workerId === 'all' || r.worker_id === workerId)
      ),
      workers: activeWorkers.filter((w) => workerId === 'all' || w.id === workerId),
      clientName: (id) => clientById.get(id) ?? '-',
      serviceLabel: (r) =>
        serviceLabel(r.service_id ? serviceById.get(r.service_id) : null, extrasByReservation.get(r.id) ?? [], services),
      labels: {
        unassigned: s.shareUnassigned,
        visit: s.shareVisit,
        title: s.shareHeading,
        empty: s.shareEmpty,
        appointments: s.shareAppointments,
      },
      showEnd,
      businessName: currentBusiness?.name,
    }
  }, [date, tz, locale, reservations, clients, services, reservationExtras, activeWorkers, workerId, showEnd, currentBusiness, s])

  const generated = useMemo(() => buildAgendaText(input), [input])
  // The text can be edited before sending; changing the day/barber/options
  // builds it again.
  useEffect(() => setEdited(null), [generated])
  const text = edited ?? generated

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(s.shareCopied)
    } catch {
      toast.error(s.shareCopyFailed)
    }
  }

  const whatsapp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  // A printable page: the browser's print dialog saves it as a PDF. If the
  // browser blocks the new window, the page is downloaded instead.
  const pdf = () => {
    const html = buildAgendaHtml(input)
    const win = window.open('', '_blank')
    if (win) {
      win.document.open()
      win.document.write(html)
      win.document.close()
      win.focus()
      setTimeout(() => win.print(), 400)
      return
    }
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `agenda-${date}.html`
    a.click()
    URL.revokeObjectURL(url)
    toast.message(s.sharePopupBlocked)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{s.shareTitle}</DialogTitle>
          <DialogDescription>{s.shareDesc}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="share-date">{s.shareDateLabel}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="share-date"
                type="date"
                className="w-auto"
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
              />
              <Button type="button" size="sm" variant={date === dayFromToday(0) ? 'default' : 'outline'} onClick={() => setDate(dayFromToday(0))}>
                {s.shareToday}
              </Button>
              <Button type="button" size="sm" variant={date === dayFromToday(1) ? 'default' : 'outline'} onClick={() => setDate(dayFromToday(1))}>
                {s.shareTomorrow}
              </Button>
            </div>
          </div>

          {activeWorkers.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="share-worker">{s.shareWorkerLabel}</Label>
              <Select value={workerId} onValueChange={setWorkerId}>
                <SelectTrigger id="share-worker">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{s.shareAllBarbers}</SelectItem>
                  {activeWorkers.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="share-end" className="cursor-pointer">
              {s.shareShowEnd}
            </Label>
            <Switch id="share-end" checked={showEnd} onCheckedChange={setShowEnd} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="share-text">{s.shareTextLabel}</Label>
            <Textarea
              id="share-text"
              rows={12}
              className="font-mono text-xs"
              value={text}
              onChange={(e) => setEdited(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={whatsapp} className="gap-2">
              <MessageCircle className="h-4 w-4" />
              {s.shareWhatsapp}
            </Button>
            <Button type="button" variant="outline" onClick={copy} className="gap-2">
              <Copy className="h-4 w-4" />
              {s.shareCopy}
            </Button>
            <Button type="button" variant="outline" onClick={pdf} className="gap-2">
              <FileDown className="h-4 w-4" />
              {s.sharePdf}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{s.sharePdfHint}</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
