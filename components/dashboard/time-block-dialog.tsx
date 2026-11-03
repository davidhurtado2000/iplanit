'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Lock, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TimeSelect } from '@/components/dashboard/time-select'
import { useLanguage } from '@/context/language-context'
import { createClient } from '@/lib/supabase/client'
import { parseInTimezone } from '@/lib/timezone'
import type { TimeBlock } from '@/lib/time-blocks'
import { cn } from '@/lib/utils'

// Create and remove time blocks (scripts/107): lunch breaks, closures, a
// staff member's day off. Who it applies to is explicit - the whole
// business, one person, or one resource - so blocking one barber never
// touches the others.

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function TimeBlockDialog({
  open,
  onOpenChange,
  businessId,
  timezone,
  workers,
  resources,
  workerGroupLabel,
  timeBlocks,
  defaultDate,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  businessId: string
  timezone: string
  workers: { id: string; name: string }[]
  resources: { id: string; name: string }[]
  workerGroupLabel: string
  timeBlocks: TimeBlock[]
  /** 'YYYY-MM-DD' business-local - prefills the date fields. */
  defaultDate: string
  onChanged: () => Promise<void> | void
}) {
  const { t, locale } = useLanguage()
  const tr = t.timeBlocks
  const supabase = useMemo(() => createClient(), [])

  const [target, setTarget] = useState('all')
  const [kind, setKind] = useState<'once' | 'weekly'>('once')
  const [date, setDate] = useState(defaultDate)
  const [dateTo, setDateTo] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [timeFrom, setTimeFrom] = useState('13:00')
  const [timeTo, setTimeTo] = useState('14:00')
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5])
  const [repeatUntil, setRepeatUntil] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDate(defaultDate)
    setDateTo('')
    setError('')
  }, [open, defaultDate])

  // Monday-first, labelled in the UI language.
  const weekdayOptions = [1, 2, 3, 4, 5, 6, 0].map((dow) => ({
    dow,
    label: new Date(Date.UTC(2024, 0, dow === 0 ? 7 : dow, 12)).toLocaleDateString(locale, { timeZone: 'UTC', weekday: 'short' }),
  }))

  const targetLabel = (b: TimeBlock) =>
    b.worker_id
      ? workers.find((w) => w.id === b.worker_id)?.name ?? '—'
      : b.resource_id
        ? resources.find((r) => r.id === b.resource_id)?.name ?? '—'
        : tr.wholeBusiness

  const fmtTime = (hhmm: string) =>
    parseInTimezone(`2024-01-01T${hhmm.slice(0, 5)}`, timezone).toLocaleTimeString(locale, {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
    })
  const fmtDate = (d: string) =>
    new Date(d + 'T12:00:00Z').toLocaleDateString(locale, { timeZone: 'UTC', day: 'numeric', month: 'short' })

  const describe = (b: TimeBlock) => {
    if (b.repeat_weekdays) {
      const days = weekdayOptions.filter((o) => b.repeat_weekdays!.includes(o.dow)).map((o) => o.label).join(', ')
      const hours = b.start_time && b.end_time ? `${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}` : tr.allDayShort
      const until = b.repeat_until ? ` · ${tr.untilDate.replace('{date}', fmtDate(b.repeat_until))}` : ''
      return `${tr.everyWeek.replace('{days}', days)} · ${hours}${until}`
    }
    if (!b.starts_at || !b.ends_at) return ''
    const start = new Date(b.starts_at)
    const end = new Date(b.ends_at)
    const opts: Intl.DateTimeFormatOptions = { timeZone: timezone, day: 'numeric', month: 'short' }
    const timeOpts: Intl.DateTimeFormatOptions = { timeZone: timezone, hour: '2-digit', minute: '2-digit' }
    const startDay = start.toLocaleDateString(locale, opts)
    // All-day ranges are stored midnight-to-midnight; show the last day.
    const lastDay = new Date(end.getTime() - 1).toLocaleDateString(locale, opts)
    const isAllDay =
      start.toLocaleTimeString('en-GB', timeOpts) === '00:00' && end.toLocaleTimeString('en-GB', timeOpts) === '00:00'
    if (isAllDay) return startDay === lastDay ? `${startDay} · ${tr.allDayShort}` : `${startDay} – ${lastDay} · ${tr.allDayShort}`
    return `${startDay} · ${start.toLocaleTimeString(locale, timeOpts)} – ${end.toLocaleTimeString(locale, timeOpts)}`
  }

  const now = new Date()
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now)
  const activeBlocks = timeBlocks
    .filter((b) => (b.repeat_weekdays ? !b.repeat_until || b.repeat_until >= today : !!b.ends_at && new Date(b.ends_at) > now))
    .sort((a, b) => (a.starts_at ?? a.repeat_from ?? '').localeCompare(b.starts_at ?? b.repeat_from ?? ''))

  const handleSave = async () => {
    setError('')
    const [kindPart, id] = target.split(':')
    const row: Record<string, unknown> = {
      business_id: businessId,
      worker_id: kindPart === 'worker' ? id : null,
      resource_id: kindPart === 'resource' ? id : null,
      reason: reason.trim() || null,
    }
    if (!allDay && timeTo <= timeFrom) {
      setError(tr.errorTimeOrder)
      return
    }
    if (kind === 'once') {
      const lastDay = allDay && dateTo ? dateTo : date
      if (lastDay < date) {
        setError(tr.errorDateOrder)
        return
      }
      row.starts_at = parseInTimezone(`${date}T${allDay ? '00:00' : timeFrom}`, timezone).toISOString()
      row.ends_at = allDay
        ? parseInTimezone(`${addDays(lastDay, 1)}T00:00`, timezone).toISOString()
        : parseInTimezone(`${date}T${timeTo}`, timezone).toISOString()
    } else {
      if (weekdays.length === 0) {
        setError(tr.errorNoWeekdays)
        return
      }
      if (repeatUntil && repeatUntil < date) {
        setError(tr.errorDateOrder)
        return
      }
      row.repeat_weekdays = weekdays
      row.repeat_from = date
      row.repeat_until = repeatUntil || null
      row.start_time = allDay ? null : timeFrom
      row.end_time = allDay ? null : timeTo
    }

    setSaving(true)
    const { error: insertError } = await supabase.from('time_blocks').insert(row as never)
    setSaving(false)
    if (insertError) {
      console.error('[iplanit] Error saving time block:', insertError)
      setError(t.saveError)
      return
    }
    toast.success(tr.saved)
    setReason('')
    await onChanged()
  }

  const handleRemove = async (id: string) => {
    setRemovingId(id)
    const { error: deleteError } = await supabase.from('time_blocks').delete().eq('id', id)
    setRemovingId(null)
    if (deleteError) {
      toast.error(t.saveError)
      return
    }
    toast.success(tr.removed)
    await onChanged()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            {tr.title}
          </DialogTitle>
          <DialogDescription>{tr.desc}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{tr.appliesTo}</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tr.wholeBusiness}</SelectItem>
                {workers.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>{workerGroupLabel}</SelectLabel>
                      {workers.map((w) => (
                        <SelectItem key={w.id} value={`worker:${w.id}`}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
                {resources.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>{t.calendar.groupByResource}</SelectLabel>
                      {resources.map((r) => (
                        <SelectItem key={r.id} value={`resource:${r.id}`}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 rounded-lg border p-1" role="radiogroup">
            {(['once', 'weekly'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  'min-h-9 rounded-md text-sm font-medium transition-colors',
                  kind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {k === 'once' ? tr.kindOnce : tr.kindWeekly}
              </button>
            ))}
          </div>

          {kind === 'weekly' && (
            <div className="space-y-2">
              <Label>{tr.weekdays}</Label>
              <div className="flex flex-wrap gap-1.5">
                {weekdayOptions.map((o) => {
                  const on = weekdays.includes(o.dow)
                  return (
                    <button
                      key={o.dow}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setWeekdays(on ? weekdays.filter((d) => d !== o.dow) : [...weekdays, o.dow])}
                      className={cn(
                        'min-h-9 min-w-11 rounded-md border px-2 text-sm capitalize transition-colors',
                        on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
                      )}
                    >
                      {o.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="block-date">{kind === 'weekly' ? tr.repeatFrom : tr.date}</Label>
              <Input id="block-date" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
            </div>
            {kind === 'weekly' ? (
              <div className="space-y-2">
                <Label htmlFor="block-until">{tr.repeatUntil}</Label>
                <Input id="block-until" type="date" value={repeatUntil} min={date} onChange={(e) => setRepeatUntil(e.target.value)} />
              </div>
            ) : (
              allDay && (
                <div className="space-y-2">
                  <Label htmlFor="block-date-to">{tr.dateTo}</Label>
                  <Input id="block-date-to" type="date" value={dateTo} min={date} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              )
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="block-all-day" className="cursor-pointer">
              {tr.allDay}
            </Label>
            <Switch id="block-all-day" checked={allDay} onCheckedChange={setAllDay} />
          </div>

          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{tr.timeFrom}</Label>
                <TimeSelect value={timeFrom} onChange={setTimeFrom} />
              </div>
              <div className="space-y-2">
                <Label>{tr.timeTo}</Label>
                <TimeSelect value={timeTo} onChange={setTimeTo} />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="block-reason">{tr.reason}</Label>
            <Input
              id="block-reason"
              value={reason}
              maxLength={120}
              onChange={(e) => setReason(e.target.value)}
              placeholder={tr.reasonPlaceholder}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t.services.cancelBtn}
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !date}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tr.save}
          </Button>
        </DialogFooter>

        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">{tr.existing}</p>
          {activeBlocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr.none}</p>
          ) : (
            <ul className="space-y-2">
              {activeBlocks.map((b) => (
                <li key={b.id} className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {targetLabel(b)}
                      {b.reason && <span className="font-normal text-muted-foreground"> · {b.reason}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{describe(b)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={removingId === b.id}
                    onClick={() => handleRemove(b.id)}
                  >
                    {removingId === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    {tr.remove}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
