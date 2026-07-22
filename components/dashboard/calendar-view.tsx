'use client'

import { useState, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight, CalendarDays, Clock, Check, ParkingSquare, Search } from 'lucide-react'
import type { CalendarView } from '@/lib/types'
import { cn, capitalizeFirst } from '@/lib/utils'

// ─── Time grid constants ───────────────────────────────────────────────────
const HOUR_HEIGHT    = 64  // px per hour
const DEFAULT_START  = 7   // fallback 07:00
const DEFAULT_END    = 21  // fallback 21:00
const DEFAULT_TZ     = 'America/Lima'

// ─── Timezone-aware date helpers ───────────────────────────────────────────
/** Returns "YYYY-MM-DD" for a Date or ISO string expressed in the given IANA timezone. */
function toDateStr(date: Date | string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(
    typeof date === 'string' ? new Date(date) : date
  )
}

/** Returns the local hour and minute of a UTC ISO string in the given IANA timezone. */
function getTzHourMin(timeStr: string, tz: string): { h: number; m: number } {
  const d = new Date(timeStr)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(d)
  const p = Object.fromEntries(parts.map(x => [x.type, Number(x.value)]))
  return { h: p.hour % 24, m: p.minute }
}

function topOffset(timeStr: string, startHour: number, tz: string) {
  const { h, m } = getTzHourMin(timeStr, tz)
  return ((h - startHour) * 60 + m) * (HOUR_HEIGHT / 60)
}

function blockHeight(startStr: string, endStr: string) {
  const mins = Math.max((new Date(endStr).getTime() - new Date(startStr).getTime()) / 60000, 15)
  return mins * (HOUR_HEIGHT / 60)
}

// ─── Interfaces ────────────────────────────────────────────────────────────
interface Resource { id: string; name: string; type: 'room' | 'person' | 'equipment' | 'virtual' | 'parking'; color: string }
interface Client   { id: string; name: string }
interface Service  { id: string; name: string; duration_minutes: number; color: string }

interface CalendarViewProps {
  view: CalendarView
  onSelectReservation: (reservation: any) => void
  onViewChange?: (view: CalendarView) => void
  reservations: any[]
  resources?: Resource[]
  clientsMap?: Record<string, Client>
  servicesMap?: Record<string, Service>
  resourcesMap?: Record<string, Resource>
  startHour?: number
  endHour?: number
  timezone?: string
  /** Fires whenever the visible date range changes (navigation or view switch). */
  onVisibleRangeChange?: (from: Date, to: Date) => void
}

// ─── Main component ────────────────────────────────────────────────────────
export function CalendarViewComponent({
  view,
  onSelectReservation,
  onViewChange,
  reservations,
  resources = [],
  clientsMap = {},
  servicesMap = {},
  resourcesMap = {},
  startHour = DEFAULT_START,
  endHour   = DEFAULT_END,
  timezone  = DEFAULT_TZ,
  onVisibleRangeChange,
}: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedResourceId, setSelectedResourceId] = useState<string>('all')

  // Let the parent know what range is on screen so it can make sure that
  // data is actually loaded (see ensureReservationsInRange in
  // dashboard-data-context) - the default fetch only covers ±90 days.
  useEffect(() => {
    // List view has no "current date" to navigate around - it just shows
    // whatever's already loaded (the default ±90 day window), so there's
    // no wider range to request here.
    if (!onVisibleRangeChange || view === 'list') return
    let from: Date
    let to: Date
    if (view === 'day') {
      from = new Date(currentDate)
      to = new Date(currentDate)
    } else if (view === 'week') {
      const start = new Date(currentDate)
      const diff = start.getDate() - start.getDay() + (start.getDay() === 0 ? -6 : 1)
      start.setDate(diff)
      from = start
      to = new Date(start)
      to.setDate(to.getDate() + 6)
    } else {
      // Month grid can show a few leading/trailing days from adjacent
      // months - pad a week on each side rather than replicating the
      // exact grid math here.
      from = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1 - 7)
      to = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0 + 7)
    }
    onVisibleRangeChange(from, to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, view])

  const navigate = (dir: -1 | 1) => {
    const d = new Date(currentDate)
    if (view === 'day')   d.setDate(d.getDate() + dir)
    else if (view === 'week') d.setDate(d.getDate() + dir * 7)
    else d.setMonth(d.getMonth() + dir)
    setCurrentDate(d)
  }

  const goToToday = () => setCurrentDate(new Date())

  const handleDayClick = (date: Date) => {
    setCurrentDate(date)
    onViewChange?.('day')
  }

  const formatHeader = () => {
    if (view === 'day') {
      return currentDate.toLocaleDateString('es-ES', { timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long' })
    }
    if (view === 'week') {
      const start = new Date(currentDate)
      const diff = start.getDate() - start.getDay() + (start.getDay() === 0 ? -6 : 1)
      start.setDate(diff)
      const end = new Date(start); end.setDate(end.getDate() + 6)
      return `${start.toLocaleDateString('es-ES', { timeZone: timezone, day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('es-ES', { timeZone: timezone, day: 'numeric', month: 'short' })}`
    }
    return currentDate.toLocaleDateString('es-ES', { timeZone: timezone, month: 'long', year: 'numeric' })
  }

  if (view === 'list') {
    return (
      <div className="flex flex-col gap-4">
        <ListView
          reservations={reservations}
          clientsMap={clientsMap}
          servicesMap={servicesMap}
          onSelectReservation={onSelectReservation}
          timezone={timezone}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)} className="h-8 w-8 bg-transparent">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => navigate(1)} className="h-8 w-8 bg-transparent">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToToday}>Hoy</Button>
        </div>
        <h2 className="text-base font-semibold sm:text-lg">{capitalizeFirst(formatHeader())}</h2>
        {view === 'day' && resources.length > 0 && (
          <Select value={selectedResourceId} onValueChange={setSelectedResourceId}>
            <SelectTrigger className="w-full bg-transparent sm:w-[200px]">
              <SelectValue placeholder="Filtrar por recurso" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los recursos</SelectItem>
              {resources.map(r => (
                <SelectItem key={r.id} value={r.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: r.color || '#3B82F6' }}
                    />
                    {r.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {view === 'day'   && <DayView   date={currentDate} reservations={reservations} resources={resources} selectedResourceId={selectedResourceId} clientsMap={clientsMap} servicesMap={servicesMap} resourcesMap={resourcesMap} onSelectReservation={onSelectReservation} startHour={startHour} endHour={endHour} timezone={timezone} />}
      {view === 'week'  && <WeekView  date={currentDate} reservations={reservations} clientsMap={clientsMap} servicesMap={servicesMap} onSelectReservation={onSelectReservation} onDayClick={handleDayClick} timezone={timezone} />}
      {view === 'month' && <MonthView date={currentDate} reservations={reservations} servicesMap={servicesMap} onSelectReservation={onSelectReservation} onDayClick={handleDayClick} timezone={timezone} />}
    </div>
  )
}

// ─── Day View — time grid × resource columns ───────────────────────────────
function DayView({
  date, reservations, resources, selectedResourceId,
  clientsMap, servicesMap, resourcesMap, onSelectReservation,
  startHour, endHour, timezone,
}: {
  date: Date
  reservations: any[]
  resources: Resource[]
  selectedResourceId: string
  clientsMap: Record<string, Client>
  servicesMap: Record<string, Service>
  resourcesMap: Record<string, Resource>
  onSelectReservation: (r: any) => void
  startHour: number
  endHour: number
  timezone: string
}) {
  // Use business timezone so "dateStr" matches the day the user sees, not UTC midnight
  const dateStr = toDateStr(date, timezone)

  const dayRes = reservations.filter(
    r => toDateStr(r.start_time, timezone) === dateStr && r.status !== 'cancelled'
  )

  // Business hours define the default range, but a reservation that falls
  // outside them (manual edge-case booking, holiday exception, legacy data)
  // must still render in full instead of being clipped off the top of the
  // grid - so the rendered range always grows to fit what's actually
  // scheduled that day, on top of the business-hours default.
  const resHours = dayRes.flatMap(r => {
    const start = getTzHourMin(r.start_time, timezone)
    const end = getTzHourMin(r.end_time, timezone)
    return [start.h, end.m > 0 ? end.h + 1 : end.h]
  })
  const effStartHour = Math.min(startHour, ...resHours)
  const effEndHour = Math.max(endHour, ...resHours)
  const HOURS = Array.from({ length: effEndHour - effStartHour }, (_, i) => effStartHour + i)

  // Build columns
  const columns = useMemo(() => {
    let cols: Array<{ id: string | null; label: string; color?: string }> = []

    if (selectedResourceId !== 'all') {
      const res = resourcesMap[selectedResourceId]
      return [{ id: selectedResourceId, label: res?.name ?? selectedResourceId, color: res?.color }]
    }

    if (resources.length > 0) {
      cols = resources.map(r => ({ id: r.id, label: r.name, color: r.color }))
      if (dayRes.some(r => !r.resource_id)) {
        cols.push({ id: null, label: 'Sin recurso' })
      }
    } else {
      cols = [{ id: null, label: 'Reservas' }]
    }
    return cols
  }, [resources, selectedResourceId, resourcesMap, dayRes])

  const getColRes = (colId: string | null) =>
    colId === null && resources.length === 0
      ? dayRes
      : dayRes.filter(r => r.resource_id === colId)

  const COL_WIDTH  = 160
  const GUTTER     = 48
  const gridHeight = HOURS.length * HOUR_HEIGHT
  const totalWidth = GUTTER + columns.length * COL_WIDTH

  return (
    <div className="rounded-lg border bg-card">
      <div className="overflow-auto max-h-[640px] rounded-lg">
        <div style={{ minWidth: totalWidth }}>

          {/* Column headers (sticky top) */}
          <div className="sticky top-0 z-30 flex border-b bg-card">
            <div className="flex-shrink-0 border-r bg-muted/40" style={{ width: GUTTER }} />
            {columns.map(col => (
              <div
                key={String(col.id)}
                className="flex flex-shrink-0 items-center justify-center gap-1.5 border-r last:border-r-0 px-3 py-2.5 text-center text-xs font-semibold bg-muted/40"
                style={{ width: COL_WIDTH, color: col.color || undefined }}
              >
                {col.color && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: col.color }}
                  />
                )}
                <span className={col.color ? '' : 'text-muted-foreground'}>{col.label}</span>
              </div>
            ))}
          </div>

          {/* Time grid — skipped entirely when the day is empty so the
              "no reservations" message shows right under the header instead
              of being pushed below a tall, empty scrollable grid. */}
          {dayRes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <CalendarDays className="h-7 w-7 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No hay reservas para este día</p>
            </div>
          ) : (
          <div className="relative flex" style={{ height: gridHeight }}>

            {/* Hour gutter (sticky left) */}
            <div
              className="sticky left-0 z-20 flex-shrink-0 border-r bg-card"
              style={{ width: GUTTER, height: gridHeight }}
            >
              {HOURS.map(h => (
                <div
                  key={h}
                  className="absolute flex w-full items-start justify-end pr-2"
                  style={{ top: (h - effStartHour) * HOUR_HEIGHT - 8 }}
                >
                  <span className="text-[10px] leading-none text-muted-foreground">
                    {String(h).padStart(2, '0')}:00
                  </span>
                </div>
              ))}
            </div>

            {/* Resource columns */}
            {columns.map(col => {
              const colRes = getColRes(col.id)
              return (
                <div
                  key={String(col.id)}
                  className="relative flex-shrink-0 border-r last:border-r-0"
                  style={{ width: COL_WIDTH, height: gridHeight }}
                >
                  {HOURS.map(h => (
                    <div key={h} className="absolute w-full border-t border-border/40" style={{ top: (h - effStartHour) * HOUR_HEIGHT }} />
                  ))}
                  {HOURS.map(h => (
                    <div key={`${h}h`} className="absolute w-full border-t border-border/20" style={{ top: (h - effStartHour) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
                  ))}

                  {colRes.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[10px] text-muted-foreground/30 select-none">—</span>
                    </div>
                  )}

                  {colRes.map(r => {
                    const client  = clientsMap[r.client_id]
                    const service = servicesMap[r.service_id]
                    const color   = service?.color ?? '#3B82F6'
                    const top     = topOffset(r.start_time, effStartHour, timezone)
                    const height  = blockHeight(r.start_time, r.end_time)
                    const isShort = height < 44
                    const { h, m } = getTzHourMin(r.start_time, timezone)
                    const endHM   = getTzHourMin(r.end_time, timezone)
                    const fmt = (hh: number, mm: number) =>
                      `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`

                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => onSelectReservation(r)}
                        className="absolute left-1 right-1 overflow-hidden rounded-md px-2 py-1 text-left text-white shadow-sm transition-all hover:brightness-110 hover:shadow-md"
                        style={{ top: top + 1, height: height - 2, backgroundColor: color }}
                      >
                        {!isShort && r.status !== 'confirmed' && (
                          <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/90 text-foreground shadow-sm">
                            {r.status === 'pending' && <Clock className="h-2 w-2" />}
                            {r.status === 'completed' && <Check className="h-2 w-2" />}
                          </span>
                        )}
                        {!isShort && r.parking_resource_id && (
                          <span
                            className="absolute left-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/90 text-foreground shadow-sm"
                            title="Cochera asignada"
                          >
                            <ParkingSquare className="h-2 w-2" />
                          </span>
                        )}
                        {isShort ? (
                          <p className="text-[10px] font-semibold leading-tight truncate">
                            {client?.name ?? '—'}
                          </p>
                        ) : (
                          <>
                            <p className="pr-4 text-xs font-semibold leading-tight truncate">{client?.name ?? '—'}</p>
                            <p className="text-[10px] leading-tight truncate opacity-90">{service?.name ?? '—'}</p>
                            <p className="mt-0.5 text-[10px] leading-tight opacity-75">
                              {fmt(h, m)} – {fmt(endHM.h, endHM.m)}
                            </p>
                          </>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Week View ─────────────────────────────────────────────────────────────
function WeekView({
  date, reservations, clientsMap, servicesMap, onSelectReservation, onDayClick, timezone,
}: {
  date: Date
  reservations: any[]
  clientsMap: Record<string, Client>
  servicesMap: Record<string, Service>
  onSelectReservation: (r: any) => void
  onDayClick: (d: Date) => void
  timezone: string
}) {
  const weekDays = useMemo(() => {
    const start = new Date(date)
    const diff = start.getDate() - start.getDay() + (start.getDay() === 0 ? -6 : 1)
    start.setDate(diff)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start); d.setDate(d.getDate() + i); return d
    })
  }, [date])

  // Use business timezone for "today" so it matches Lima date regardless of server UTC
  const today     = toDateStr(new Date(), timezone)
  const dayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <div className="grid min-w-[560px]" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {weekDays.map((d, i) => {
          // Use business timezone to get the correct local date string for this column
          const dateStr = toDateStr(d, timezone)
          const isToday = dateStr === today
          const dayNum  = parseInt(dateStr.split('-')[2], 10)
          const dayRes  = reservations.filter(
            r => toDateStr(r.start_time, timezone) === dateStr && r.status !== 'cancelled'
          )
          return (
            <button
              type="button"
              key={dateStr}
              onClick={() => onDayClick(d)}
              className={cn(
                'border-r last:border-r-0 p-2 text-left min-h-[120px] transition-colors hover:bg-muted/40 group',
                isToday && 'bg-primary/5'
              )}
            >
              <div className="mb-2 flex flex-col items-center">
                <span className="text-[11px] text-muted-foreground">{dayLabels[i]}</span>
                <span className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                  isToday ? 'bg-primary text-primary-foreground' : 'group-hover:bg-muted'
                )}>
                  {dayNum}
                </span>
                {dayRes.length > 0 && (
                  <Badge variant="secondary" className="mt-1 h-4 text-[9px] px-1">
                    {dayRes.length}
                  </Badge>
                )}
              </div>
              <div className="space-y-0.5">
                {dayRes.slice(0, 4).map(r => {
                  const client  = clientsMap[r.client_id]
                  const service = servicesMap[r.service_id]
                  const { h, m } = getTzHourMin(r.start_time, timezone)
                  const fmt = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
                  return (
                    <div
                      key={r.id}
                      className="flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                      style={{ backgroundColor: service?.color ?? '#3B82F6' }}
                      onClick={e => { e.stopPropagation(); onSelectReservation(r) }}
                    >
                      {r.status === 'pending' && <Clock className="h-2.5 w-2.5 shrink-0" />}
                      {r.status === 'completed' && <Check className="h-2.5 w-2.5 shrink-0" />}
                      <span className="truncate">{fmt} {client?.name ?? '—'}</span>
                    </div>
                  )
                })}
                {dayRes.length > 4 && (
                  <p className="text-[10px] text-muted-foreground pl-1">+{dayRes.length - 4} más</p>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Month View ────────────────────────────────────────────────────────────
function MonthView({
  date, reservations, servicesMap, onSelectReservation, onDayClick, timezone,
}: {
  date: Date
  reservations: any[]
  servicesMap: Record<string, Service>
  onSelectReservation: (r: any) => void
  onDayClick: (d: Date) => void
  timezone: string
}) {
  const monthDays = useMemo(() => {
    const year  = date.getFullYear()
    const month = date.getMonth()
    const first = new Date(year, month, 1)
    const last  = new Date(year, month + 1, 0)
    const days: Array<{ date: Date; isCurrentMonth: boolean }> = []
    const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1

    for (let i = startDay - 1; i >= 0; i--)
      days.push({ date: new Date(year, month, -i), isCurrentMonth: false })
    for (let i = 1; i <= last.getDate(); i++)
      days.push({ date: new Date(year, month, i), isCurrentMonth: true })
    const remaining = 42 - days.length
    for (let i = 1; i <= remaining; i++)
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false })
    return days
  }, [date])

  const today     = toDateStr(new Date(), timezone)
  const dayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  return (
    <div className="rounded-lg border bg-card">
      <div className="grid grid-cols-7 border-b">
        {dayLabels.map(d => (
          <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {monthDays.map(({ date: d, isCurrentMonth }, index) => {
          // Month dates are constructed with new Date(year, month, day) — midnight local.
          // toDateStr with business tz gives the correct Lima date string.
          const dateStr = toDateStr(d, timezone)
          const isToday = dateStr === today
          const dayNum  = parseInt(dateStr.split('-')[2], 10)
          const dayRes  = reservations.filter(
            r => toDateStr(r.start_time, timezone) === dateStr && r.status !== 'cancelled'
          )
          return (
            <button
              type="button"
              key={index}
              onClick={() => onDayClick(d)}
              className={cn(
                'min-h-[80px] sm:min-h-[100px] border-b border-r p-1 text-left transition-colors hover:bg-muted/40 group',
                !isCurrentMonth && 'bg-muted/20'
              )}
            >
              <div className={cn(
                'mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs sm:text-sm transition-colors',
                isToday && 'bg-primary text-primary-foreground font-semibold',
                !isCurrentMonth && 'text-muted-foreground/50',
                !isToday && 'group-hover:bg-muted'
              )}>
                {dayNum}
              </div>
              <div className="space-y-0.5">
                {dayRes.slice(0, 3).map(r => {
                  const service = servicesMap[r.service_id]
                  const { h, m } = getTzHourMin(r.start_time, timezone)
                  const fmt = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
                  return (
                    <div
                      key={r.id}
                      className="flex w-full items-center gap-0.5 truncate rounded px-1 py-0.5 text-[9px] sm:text-[10px] text-white"
                      style={{ backgroundColor: service?.color ?? '#3B82F6' }}
                      onClick={e => { e.stopPropagation(); onSelectReservation(r) }}
                    >
                      {r.status === 'pending' && <Clock className="h-2 w-2 shrink-0" />}
                      {r.status === 'completed' && <Check className="h-2 w-2 shrink-0" />}
                      <span className="truncate">{fmt}</span>
                    </div>
                  )
                })}
                {dayRes.length > 3 && (
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground pl-1">+{dayRes.length - 3} más</p>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── List View — searchable/filterable table, for reviewing and auditing
// rather than browsing a specific day (see day/week/month above for that).
// Works off whatever's already loaded (±90 days by default, same as the
// rest of the calendar) instead of its own paginated query. ────────────────
const LIST_PAGE_SIZE = 20

const STATUS_LABELS_ES: Record<string, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No-show',
}

function listStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'cancelled' || status === 'no_show') return 'destructive'
  if (status === 'pending') return 'secondary'
  return 'default'
}

function ListView({
  reservations, clientsMap, servicesMap, onSelectReservation, timezone,
}: {
  reservations: any[]
  clientsMap: Record<string, Client>
  servicesMap: Record<string, Service>
  onSelectReservation: (r: any) => void
  timezone: string
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return reservations
      .filter((r) => {
        if (statusFilter !== 'all' && r.status !== statusFilter) return false
        if (typeFilter !== 'all' && (r.type || 'booking') !== typeFilter) return false
        if (!q) return true
        const clientName = clientsMap[r.client_id]?.name?.toLowerCase() ?? ''
        const serviceName = servicesMap[r.service_id]?.name?.toLowerCase() ?? ''
        return clientName.includes(q) || serviceName.includes(q)
      })
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
  }, [reservations, clientsMap, servicesMap, search, statusFilter, typeFilter])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, typeFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / LIST_PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE)

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente o servicio..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="confirmed">Confirmada</SelectItem>
            <SelectItem value="completed">Completada</SelectItem>
            <SelectItem value="cancelled">Cancelada</SelectItem>
            <SelectItem value="no_show">No-show</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="booking">Reserva</SelectItem>
            <SelectItem value="visit">Visita</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="whitespace-nowrap p-2 text-left font-medium">Fecha</th>
              <th className="p-2 text-left font-medium">Cliente</th>
              <th className="p-2 text-left font-medium">Servicio</th>
              <th className="p-2 text-left font-medium">Estado</th>
              <th className="p-2 text-left font-medium" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const client = clientsMap[r.client_id]
              const service = servicesMap[r.service_id]
              const { h, m } = getTzHourMin(r.start_time, timezone)
              return (
                <tr
                  key={r.id}
                  onClick={() => onSelectReservation(r)}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                >
                  <td className="whitespace-nowrap p-2">
                    {capitalizeFirst(
                      new Date(r.start_time).toLocaleDateString('es-ES', { timeZone: timezone, day: 'numeric', month: 'short' })
                    )}{' '}
                    {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}
                  </td>
                  <td className="p-2">{client?.name ?? '—'}</td>
                  <td className="p-2">
                    <span className="flex items-center gap-1.5">
                      {service && (
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: service.color }} />
                      )}
                      {service?.name ?? (r.type === 'visit' ? 'Visita' : '—')}
                    </span>
                  </td>
                  <td className="p-2">
                    <Badge variant={listStatusBadgeVariant(r.status)}>
                      {STATUS_LABELS_ES[r.status] ?? r.status}
                    </Badge>
                  </td>
                  <td className="p-2 text-right">
                    {r.parking_resource_id && <ParkingSquare className="ml-auto h-3.5 w-3.5 text-muted-foreground" />}
                  </td>
                </tr>
              )
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  No se encontraron reservas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Pagina {page} de {totalPages} · {filtered.length} resultados
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
