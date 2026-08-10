'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
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
import { ChevronLeft, ChevronRight, CalendarOff, ParkingSquare, Search, Eye, HelpCircle, Clock, Check, CheckCheck, X, Minus } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { CalendarView } from '@/lib/types'
import { cn, capitalizeFirst } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { getStatusLabel } from '@/lib/reservation-status'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { sedeAbbr, sedeTint } from '@/lib/sede-colors'
import { isDayClosed, getDayHoursRange, type BusinessHourRow } from '@/lib/availability'

// ─── Time grid constants ───────────────────────────────────────────────────
const HOUR_HEIGHT    = 64  // px per hour
const DEFAULT_START  = 7   // fallback 07:00
const DEFAULT_END    = 21  // fallback 21:00
const DEFAULT_TZ     = 'America/Lima'
// DayView only - breathing room above the very first gridline so its hour
// label (e.g. "07:00") isn't sitting flush against the scroll container's
// top edge. Every top offset in DayView's hour grid (gridlines, labels,
// reservation blocks) adds this same constant.
const GRID_TOP_PAD   = 16

// A visit's block always uses this instead of its (optional, informational
// only) service's color - color alone is what actually reads at a glance
// across a whole day/week/month, unlike a small icon that only shows up on
// close inspection. Matches the banner in reservation-modal.tsx's view
// mode, so "this is a visit" means the same color everywhere. Deliberately
// a neutral gray, NOT one of the 8 swatches in SERVICE_COLORS/
// RESOURCE_COLORS (services/page.tsx, resources/page.tsx) - reusing one of
// those would make a real service that happens to use that color
// indistinguishable from a visit, defeating the whole point. Gray also
// reads correctly on its own: "not a real colored service", administrative
// rather than a color a business would ever brand a paid service with.
export const VISIT_BLOCK_COLOR = '#64748b'

// Visit blocks get a diagonal-stripe texture instead of a flat fill - the
// same "tentative event" convention Google Calendar/Outlook use - so the
// distinction reads as "a different kind of block" rather than just a
// duller color. Still built on VISIT_BLOCK_COLOR alone (never a new hue),
// so it can't collide with a service/resource's own solid color.
function visitPatternStyle(baseColor: string) {
  return {
    backgroundColor: baseColor,
    backgroundImage:
      'repeating-linear-gradient(135deg, rgba(255,255,255,0.16) 0px, rgba(255,255,255,0.16) 5px, transparent 5px, transparent 11px)',
  }
}

// A colored left border signals status at a glance without replacing the
// block's own background (still the service's color, so services stay
// visually identifiable) - shared by every calendar render mode below.
function statusBorderClass(status: string): string {
  switch (status) {
    case 'pending':   return 'border-l-4 border-amber-400'
    case 'confirmed': return 'border-l-4 border-emerald-400'
    case 'completed': return 'border-l-4 border-sky-400'
    case 'cancelled': return 'border-l-4 border-red-400'
    case 'no_show':   return 'border-l-4 border-orange-500'
    default:          return ''
  }
}

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
interface Resource { id: string; name: string; type: 'room' | 'person' | 'equipment' | 'virtual' | 'parking'; color: string; business_id?: string }
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
  /** Sede name per business_id - only passed while "vista expandida" is on
   * (scripts/053-organizations-and-sedes.sql). When present, blocks/columns
   * belonging to a business other than the currently active one get a
   * small sede label so they're not mistaken for the active sede's own. */
  businessNameById?: Record<string, string>
  /** Stable per-sede tint index (see SEDE_TINTS), same key set as
   * businessNameById - kept as a separate prop so the parent only decides
   * ordering/assignment, not the actual palette. */
  businessColorIndexById?: Record<string, number>
  /** Drives DayView's per-day closed message and out-of-hours shading (see
   * lib/availability.ts's isDayClosed/getDayHoursRange, already shared with
   * the reservation modal's own slot picker and the public booking page, so
   * "available" means the same thing everywhere). Undefined (not yet
   * loaded) is treated as permissively open, same fallback used elsewhere. */
  businessHours?: BusinessHourRow[]
  /** Seeds the initially-shown date (e.g. a notification linking to a
   * specific reservation's day) instead of always starting on today.
   * Read once on mount only - changing this prop after mount does not
   * re-navigate, since the user's own in-page navigation should win from
   * then on. */
  initialDate?: Date
  /** DayView only - fires on a plain click (single point) OR a mouse-drag
   * (LettuceMeet/Google-Calendar style range select) on an empty part of
   * the grid (not an existing reservation block), already confirmed to be
   * inside business hours (a drag straddling the edge of business hours is
   * clamped to the open portion, not rejected outright). resourceId is
   * null for the "no resource" fallback column; both times are
   * "YYYY-MM-DDTHH:MM" in business-local time, snapped to the nearest 15
   * minutes. endDateTimeLocal is only present for a real drag (more than a
   * few px of movement) - a plain click omits it, same as before. Touch/pen
   * input always omits it too (see DayView - dragging is mouse-only, to
   * avoid fighting the grid's native touch-scroll gesture). Undefined
   * disables the interaction entirely (no hover affordance either). */
  onCreateAtSlot?: (resourceId: string | null, dateTimeLocal: string, endDateTimeLocal?: string) => void
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
  businessNameById,
  businessColorIndexById,
  businessHours,
  initialDate,
  onCreateAtSlot,
}: CalendarViewProps) {
  const { t, locale } = useLanguage()
  const [currentDate, setCurrentDate] = useState(() => initialDate ?? new Date())
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
      // A single point in time (both from/to equal to currentDate) was
      // harmless for the single-sede default fetch (dashboard-data-context
      // already loads ±90 days and only checks "is this covered?"), but
      // vista expandida's org-wide fetch (calendar/page.tsx) uses this
      // range as a real gte/lte query filter - two near-identical
      // timestamps matched almost nothing, silently dropping every
      // reservation that day from the expanded view. Pad a day on each
      // side (same generous-padding approach as week/month below) so it
      // safely covers the whole day regardless of any gap between the
      // browser's local timezone and the business's own.
      from = new Date(currentDate)
      from.setDate(from.getDate() - 1)
      from.setHours(0, 0, 0, 0)
      to = new Date(currentDate)
      to.setDate(to.getDate() + 1)
      to.setHours(23, 59, 59, 999)
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
      return currentDate.toLocaleDateString(locale, { timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long' })
    }
    if (view === 'week') {
      const start = new Date(currentDate)
      const diff = start.getDate() - start.getDay() + (start.getDay() === 0 ? -6 : 1)
      start.setDate(diff)
      const end = new Date(start); end.setDate(end.getDate() + 6)
      return `${start.toLocaleDateString(locale, { timeZone: timezone, day: 'numeric', month: 'short' })} – ${end.toLocaleDateString(locale, { timeZone: timezone, day: 'numeric', month: 'short' })}`
    }
    return currentDate.toLocaleDateString(locale, { timeZone: timezone, month: 'long', year: 'numeric' })
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
          t={t}
          locale={locale}
          businessNameById={businessNameById}
          businessColorIndexById={businessColorIndexById}
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
          <Button variant="ghost" size="sm" onClick={goToToday}>{t.calendar.today}</Button>
        </div>
        <h2 className="text-base font-semibold sm:text-lg">{capitalizeFirst(formatHeader())}</h2>
        {view === 'day' && resources.length > 0 && (
          <Select value={selectedResourceId} onValueChange={setSelectedResourceId}>
            <SelectTrigger className="w-full bg-transparent sm:w-[200px]">
              <SelectValue placeholder={t.calendar.filterByResourcePlaceholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.calendar.allResources}</SelectItem>
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

      {/* The gray+eye visit convention stays always-visible here (it's the
          one signal with zero prior exposure anywhere else in the product -
          see VISIT_BLOCK_COLOR above). Status colors and the parking badge
          are already learnable elsewhere (status filter, list view text),
          so they only need to be one click away, not permanently on
          screen - hence the "?" popover instead of more inline rows. Only
          reached for day/week/month - list view returns early above. */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: VISIT_BLOCK_COLOR }}
          />
          <Eye className="h-3 w-3 shrink-0" />
          <span>{t.calendar.visitLegendLabel}</span>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <HelpCircle className="h-3.5 w-3.5 shrink-0" />
              {t.calendar.legendButtonLabel}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64">
            <p className="mb-2 text-sm font-semibold text-foreground">{t.calendar.legendTitle}</p>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t.calendar.legendStatusHeading}
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-foreground">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400" />
                <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span>{t.reservation.pending}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-foreground">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400" />
                <Check className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span>{t.reservation.confirmed}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-foreground">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-sky-400" />
                <CheckCheck className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span>{t.reservation.completed}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-foreground">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-400" />
                <X className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span>{t.reservation.cancelled}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-foreground">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-orange-500" />
                <Minus className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span>{t.reservation.noShow}</span>
              </div>
            </div>
            <div className="my-2.5 border-t" />
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-foreground">
                <ParkingSquare className="h-3 w-3 shrink-0" />
                <span>{t.calendar.parkingAssigned}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-foreground">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: VISIT_BLOCK_COLOR }}
                />
                <Eye className="h-3 w-3 shrink-0" />
                <span>{t.calendar.visitLegendLabel}</span>
              </div>
              {businessNameById && (
                <div className="flex items-center gap-2 text-xs text-foreground">
                  <span className="shrink-0 rounded border px-0.5 text-[8px] font-bold leading-none">SD</span>
                  <span>{t.calendar.legendSedeLabel}</span>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {view === 'day'   && <DayView   date={currentDate} reservations={reservations} resources={resources} selectedResourceId={selectedResourceId} clientsMap={clientsMap} servicesMap={servicesMap} resourcesMap={resourcesMap} onSelectReservation={onSelectReservation} startHour={startHour} endHour={endHour} timezone={timezone} t={t} businessNameById={businessNameById} businessColorIndexById={businessColorIndexById} businessHours={businessHours} onCreateAtSlot={onCreateAtSlot} />}
      {view === 'week'  && <WeekView  date={currentDate} reservations={reservations} clientsMap={clientsMap} servicesMap={servicesMap} onSelectReservation={onSelectReservation} onDayClick={handleDayClick} timezone={timezone} t={t} locale={locale} businessNameById={businessNameById} businessColorIndexById={businessColorIndexById} />}
      {view === 'month' && <MonthView date={currentDate} reservations={reservations} servicesMap={servicesMap} onSelectReservation={onSelectReservation} onDayClick={handleDayClick} timezone={timezone} t={t} locale={locale} businessNameById={businessNameById} businessColorIndexById={businessColorIndexById} />}
    </div>
  )
}

// ─── Day View — time grid × resource columns ───────────────────────────────
function DayView({
  date, reservations, resources, selectedResourceId,
  clientsMap, servicesMap, resourcesMap, onSelectReservation,
  startHour, endHour, timezone, t, businessNameById, businessColorIndexById, businessHours, onCreateAtSlot,
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
  t: ReturnType<typeof useLanguage>['t']
  businessNameById?: Record<string, string>
  businessColorIndexById?: Record<string, number>
  businessHours?: BusinessHourRow[]
  onCreateAtSlot?: (resourceId: string | null, dateTimeLocal: string, endDateTimeLocal?: string) => void
}) {
  // Use business timezone so "dateStr" matches the day the user sees, not UTC midnight
  const dateStr = toDateStr(date, timezone)

  // Undefined businessHours (not loaded yet) is treated as "open" - same
  // permissive fallback lib/availability.ts already uses elsewhere, so a
  // slow network doesn't briefly flash "closed" on every date.
  const isClosed = businessHours ? isDayClosed(dateStr, businessHours, timezone) : false
  const dayHoursRange = businessHours ? getDayHoursRange(dateStr, businessHours, timezone) : null

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
    let cols: Array<{ id: string | null; label: string; color?: string; sedeLabel?: string; sedeColorIndex?: number }> = []

    if (selectedResourceId !== 'all') {
      const res = resourcesMap[selectedResourceId]
      return [{
        id: selectedResourceId,
        label: res?.name ?? selectedResourceId,
        color: res?.color,
        sedeLabel: res?.business_id ? businessNameById?.[res.business_id] : undefined,
        sedeColorIndex: res?.business_id ? businessColorIndexById?.[res.business_id] : undefined,
      }]
    }

    if (resources.length > 0) {
      cols = resources.map(r => ({
        id: r.id,
        label: r.name,
        color: r.color,
        sedeLabel: r.business_id ? businessNameById?.[r.business_id] : undefined,
        sedeColorIndex: r.business_id ? businessColorIndexById?.[r.business_id] : undefined,
      }))
      if (dayRes.some(r => !r.resource_id)) {
        cols.push({ id: null, label: t.calendar.noResourceColumn })
      }
    } else {
      cols = [{ id: null, label: t.calendar.reservationsFallbackColumn }]
    }
    return cols
  }, [resources, selectedResourceId, resourcesMap, dayRes, t, businessNameById, businessColorIndexById])

  // Groups consecutive columns that share the same sede into one spanning
  // header cell instead of repeating a (sometimes long) business name on
  // every single resource column - relies on `resources` already being
  // grouped by business (see calendar/page.tsx's org-wide fetch, sorted by
  // business before being passed down) so consecutive-same-label columns
  // really do form one contiguous run per sede, not fragments.
  const columnGroups = useMemo(() => {
    const groups: Array<{ sedeLabel?: string; sedeColorIndex?: number; count: number }> = []
    for (const col of columns) {
      const last = groups[groups.length - 1]
      if (last && last.sedeLabel === col.sedeLabel) {
        last.count++
      } else {
        groups.push({ sedeLabel: col.sedeLabel, sedeColorIndex: col.sedeColorIndex, count: 1 })
      }
    }
    return groups
  }, [columns])
  const hasSedeGroups = columns.some(c => c.sedeLabel)

  const getColRes = (colId: string | null) =>
    colId === null && resources.length === 0
      ? dayRes
      : dayRes.filter(r => r.resource_id === colId)

  const COL_WIDTH  = 160
  const GUTTER     = 48
  const gridHeight = HOURS.length * HOUR_HEIGHT + GRID_TOP_PAD
  const totalWidth = GUTTER + columns.length * COL_WIDTH

  // Shades the part of the rendered grid that falls before opening / after
  // closing - the grid's own start/end (effStartHour/effEndHour) can be
  // wider than this specific day's actual hours (calendar/page.tsx's
  // startHour/endHour are a week-wide min/max across every open day, plus
  // any out-of-range reservation - see effStartHour above), so without this
  // a business that closes early on Saturdays would otherwise look equally
  // bookable all evening.
  const minutesToTop = (totalMinutes: number) => GRID_TOP_PAD + (totalMinutes - effStartHour * 60) * (HOUR_HEIGHT / 60)
  const gridBottom = GRID_TOP_PAD + HOURS.length * HOUR_HEIGHT
  const beforeOpenHeight = dayHoursRange ? Math.max(0, minutesToTop(dayHoursRange.openMinutes) - GRID_TOP_PAD) : 0
  const afterCloseTop = dayHoursRange ? minutesToTop(dayHoursRange.closeMinutes) : gridBottom
  const afterCloseHeight = dayHoursRange ? Math.max(0, gridBottom - afterCloseTop) : 0

  // Click-to-create, extended into drag-to-select (LettuceMeet/Google-
  // Calendar style): a plain click still opens the create form with just a
  // start-time hint (unchanged); a mouse-drag also captures an end-time
  // hint. Mouse only, deliberately - drag-tracking would fight the grid's
  // native touch-scroll gesture on a tablet, and getting that
  // disambiguation right (e.g. requiring a long-press to start a drag) is
  // its own separate problem. Touch/pen input always falls through to the
  // plain-click path via the native `click` event fired after `pointerup`.
  const DRAG_THRESHOLD_PX = 10
  const [drag, setDrag] = useState<{ colId: string | null; startY: number; currentY: number } | null>(null)
  // Set right before calling onCreateAtSlot from a mouse pointerup, so the
  // synthetic `click` event that follows every pointer sequence (mouse
  // AND touch) doesn't also fire handleClick and double-create.
  const pointerHandledRef = useRef(false)

  const yToMinutes = (y: number) => {
    const rawMinutes = effStartHour * 60 + ((y - GRID_TOP_PAD) / HOUR_HEIGHT) * 60
    return Math.round(rawMinutes / 15) * 15
  }
  const minutesToLocal = (minutes: number) => {
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0')
    const mm = String(minutes % 60).padStart(2, '0')
    return `${dateStr}T${hh}:${mm}`
  }

  // Shared by both the drag finish and the plain-click fallback. Rejects
  // outright only when there's no overlap with business hours at all
  // (matches the old click-only behavior); a drag that partially overlaps
  // is clamped to the open portion instead of losing the whole gesture.
  const finalizeSlot = (colId: string | null, startY: number, endY: number, isDrag: boolean) => {
    if (!onCreateAtSlot) return
    let startMin = yToMinutes(Math.min(startY, endY))
    let endMin = yToMinutes(Math.max(startY, endY))
    if (dayHoursRange) {
      if (startMin >= dayHoursRange.closeMinutes || endMin <= dayHoursRange.openMinutes) return
      startMin = Math.max(startMin, dayHoursRange.openMinutes)
      endMin = Math.min(endMin, dayHoursRange.closeMinutes)
    }
    if (isDrag && endMin > startMin) {
      onCreateAtSlot(colId, minutesToLocal(startMin), minutesToLocal(endMin))
    } else {
      onCreateAtSlot(colId, minutesToLocal(startMin))
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, colId: string | null) => {
    if (!onCreateAtSlot || e.pointerType !== 'mouse' || e.target !== e.currentTarget) return
    if (e.nativeEvent.offsetY < GRID_TOP_PAD) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ colId, startY: e.nativeEvent.offsetY, currentY: e.nativeEvent.offsetY })
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>, colId: string | null) => {
    if (!drag || drag.colId !== colId) return
    // Pointer capture keeps these events targeting this column even once
    // the cursor leaves it, so offsetY (relative to whatever element is
    // actually under the pointer) is no longer reliable - measuring
    // against this column's own rect directly is.
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    setDrag((prev) => (prev ? { ...prev, currentY: y } : prev))
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>, colId: string | null) => {
    if (!drag || drag.colId !== colId) return
    const isDrag = Math.abs(drag.currentY - drag.startY) >= DRAG_THRESHOLD_PX
    pointerHandledRef.current = true
    finalizeSlot(colId, drag.startY, drag.currentY, isDrag)
    setDrag(null)
  }

  // Fallback path for touch/pen (and a no-op safety net for mouse, guarded
  // by pointerHandledRef so it never double-fires after a pointer-driven
  // create already happened).
  const handleClick = (e: React.MouseEvent<HTMLDivElement>, colId: string | null) => {
    if (pointerHandledRef.current) {
      pointerHandledRef.current = false
      return
    }
    if (!onCreateAtSlot || e.target !== e.currentTarget) return
    const y = e.nativeEvent.offsetY
    finalizeSlot(colId, y, y, false)
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="overflow-auto max-h-[640px] rounded-lg">
        <div style={{ minWidth: totalWidth }}>

          {/* Column headers (sticky top) */}
          <div className="sticky top-0 z-30 bg-card">
            {/* Sede group row - one wide cell spanning every consecutive
                column that belongs to the same sede, instead of repeating
                the (often long) business name on each narrow column. Only
                rendered at all in vista expandida. */}
            {hasSedeGroups && (
              <div className="flex border-b">
                <div className="flex-shrink-0 border-r bg-muted/40" style={{ width: GUTTER }} />
                {columnGroups.map((group, i) => {
                  const tint = sedeTint(group.sedeColorIndex)
                  return (
                    <div
                      key={i}
                      className={cn(
                        'flex min-w-0 flex-shrink-0 items-center justify-center border-r px-2 py-1.5 text-center',
                        tint ? tint.bg : 'bg-card'
                      )}
                      style={{ width: group.count * COL_WIDTH }}
                    >
                      {group.sedeLabel && (
                        <span className={cn('min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide', tint ? tint.text : 'text-foreground')}>
                          {group.sedeLabel}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <div className="flex border-b">
              <div className="flex-shrink-0 border-r bg-muted/40" style={{ width: GUTTER }} />
              {columns.map(col => (
                <div
                  key={String(col.id)}
                  className="flex min-w-0 flex-shrink-0 items-center justify-center gap-1.5 border-r last:border-r-0 px-3 py-2.5 text-center text-xs font-semibold bg-muted/40"
                  style={{ width: COL_WIDTH, color: col.color || undefined }}
                >
                  {col.color && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: col.color }}
                    />
                  )}
                  <span className={cn('min-w-0 truncate', col.color ? '' : 'text-muted-foreground')}>{col.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Time grid — skipped only when the business doesn't open at all
              this day AND there's nothing already booked on it (an edge
              case - e.g. hours changed after a booking was made - must
              still render normally so that reservation stays visible and
              editable, never silently hidden behind a "closed" message).
              An open day with zero reservations still renders the
              (possibly partially shaded) grid, both to show its actual
              hours and so it stays clickable for creating a reservation
              directly on it. */}
          {isClosed && dayRes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <CalendarOff className="h-7 w-7 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">{t.calendar.businessClosedForDay}</p>
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
                  // -8 centers the label vertically on its gridline.
                  // GRID_TOP_PAD is what keeps that from going negative for
                  // the very first hour (which used to push it above the
                  // grid's own top edge and out of the scroll container's
                  // visible area, cutting it off entirely - see the
                  // screenshot that caught this); Math.max is just a
                  // defensive floor in case GRID_TOP_PAD is ever shrunk.
                  style={{ top: Math.max(0, GRID_TOP_PAD + (h - effStartHour) * HOUR_HEIGHT - 8) }}
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
                  className={cn(
                    'relative flex-shrink-0 border-r last:border-r-0',
                    onCreateAtSlot && 'cursor-pointer hover:bg-muted/30'
                  )}
                  style={{ width: COL_WIDTH, height: gridHeight, touchAction: onCreateAtSlot ? 'pan-y' : undefined }}
                  onClick={(e) => handleClick(e, col.id)}
                  onPointerDown={(e) => handlePointerDown(e, col.id)}
                  onPointerMove={(e) => handlePointerMove(e, col.id)}
                  onPointerUp={(e) => handlePointerUp(e, col.id)}
                  onPointerCancel={() => setDrag(null)}
                >
                  {drag && drag.colId === col.id && Math.abs(drag.currentY - drag.startY) >= DRAG_THRESHOLD_PX && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-10 rounded border-2 border-primary/60 bg-primary/15"
                      style={{
                        top: Math.min(drag.startY, drag.currentY),
                        height: Math.abs(drag.currentY - drag.startY),
                      }}
                    />
                  )}
                  {/* Out-of-hours shading - flat, no stripes, so it never
                      reads as "visit" (VISIT_BLOCK_COLOR's diagonal stripe
                      is already that signal elsewhere in this file).
                      pointer-events-none on every decorative layer below so
                      handleClick's e.target === e.currentTarget check
                      (only fires on a direct hit on the column's own
                      background) isn't defeated by clicking a gridline or
                      shading div sitting on top of it. */}
                  {beforeOpenHeight > 0 && (
                    <div className="pointer-events-none absolute inset-x-0 bg-muted/50" style={{ top: GRID_TOP_PAD, height: beforeOpenHeight }} />
                  )}
                  {afterCloseHeight > 0 && (
                    <div className="pointer-events-none absolute inset-x-0 bg-muted/50" style={{ top: afterCloseTop, height: afterCloseHeight }} />
                  )}
                  {HOURS.map(h => (
                    <div key={h} className="pointer-events-none absolute w-full border-t border-border/40" style={{ top: GRID_TOP_PAD + (h - effStartHour) * HOUR_HEIGHT }} />
                  ))}
                  {HOURS.map(h => (
                    <div key={`${h}h`} className="pointer-events-none absolute w-full border-t border-border/20" style={{ top: GRID_TOP_PAD + (h - effStartHour) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
                  ))}

                  {colRes.length === 0 && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <span className="text-[10px] text-muted-foreground/30 select-none">—</span>
                    </div>
                  )}

                  {colRes.map(r => {
                    const client  = clientsMap[r.client_id]
                    const service = servicesMap[r.service_id]
                    const color   = r.type === 'visit' ? VISIT_BLOCK_COLOR : service?.color ?? '#3B82F6'
                    const top     = GRID_TOP_PAD + topOffset(r.start_time, effStartHour, timezone)
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
                        title={getStatusLabel(r.status, t.reservation)}
                        className={cn(
                          'absolute left-1 right-1 overflow-hidden rounded-lg px-2.5 py-1.5 text-left text-white shadow-sm transition-all hover:brightness-110 hover:shadow-md',
                          statusBorderClass(r.status),
                          (r.status === 'cancelled' || r.status === 'no_show') && 'opacity-45 saturate-50'
                        )}
                        style={{
                          top: top + 1,
                          height: height - 2,
                          ...(r.type === 'visit' ? visitPatternStyle(color) : { backgroundColor: color }),
                        }}
                      >
                        {isShort ? (
                          <p className="flex items-center gap-1 text-[10px] font-semibold leading-tight truncate">
                            {r.type === 'visit' && <Eye className="h-2.5 w-2.5 shrink-0" />}
                            {client?.name ?? '—'}
                          </p>
                        ) : (
                          <>
                            <p className="flex items-center gap-1 text-xs font-semibold leading-tight truncate">
                              {r.type === 'visit' && <Eye className="h-3 w-3 shrink-0" />}
                              {client?.name ?? '—'}
                            </p>
                            {service && (
                              <p className="text-[10px] leading-tight truncate opacity-80">
                                {r.type === 'visit' ? `${t.calendar.interestedInShortLabel} ` : ''}{service.name}
                              </p>
                            )}
                            <p className="mt-0.5 flex items-center gap-1 text-[10px] leading-tight opacity-70">
                              <span>{fmt(h, m)} – {fmt(endHM.h, endHM.m)}</span>
                              {r.parking_resource_id && (
                                <span className="flex items-center gap-0.5" title={t.calendar.parkingAssigned}>
                                  <span aria-hidden>·</span>
                                  <ParkingSquare className="h-2.5 w-2.5 shrink-0" />
                                </span>
                              )}
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
  date, reservations, clientsMap, servicesMap, onSelectReservation, onDayClick, timezone, t, locale, businessNameById, businessColorIndexById,
}: {
  date: Date
  reservations: any[]
  clientsMap: Record<string, Client>
  servicesMap: Record<string, Service>
  onSelectReservation: (r: any) => void
  onDayClick: (d: Date) => void
  timezone: string
  t: ReturnType<typeof useLanguage>['t']
  locale: string
  businessNameById?: Record<string, string>
  businessColorIndexById?: Record<string, number>
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
  // Monday-first short weekday labels in the account's own language, same
  // Intl-driven approach as reservation-modal.tsx's dayLabels (rather than
  // a hardcoded Spanish array) - 1970-01-05 was a Monday.
  const dayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        capitalizeFirst(
          new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
            new Date(Date.UTC(1970, 0, 5 + i))
          )
        )
      ),
    [locale]
  )

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
                  const rowColor = service?.color ?? '#3B82F6'
                  return (
                    <div
                      key={r.id}
                      title={getStatusLabel(r.status, t.reservation)}
                      className={cn(
                        'flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium text-white',
                        statusBorderClass(r.status),
                        (r.status === 'cancelled' || r.status === 'no_show') && 'opacity-45 saturate-50'
                      )}
                      style={r.type === 'visit' ? visitPatternStyle(VISIT_BLOCK_COLOR) : { backgroundColor: rowColor }}
                      onClick={e => { e.stopPropagation(); onSelectReservation(r) }}
                    >
                      {businessNameById?.[r.business_id] && (
                        <span
                          className={cn(
                            'shrink-0 rounded px-0.5 text-[8px] font-bold leading-none',
                            sedeTint(businessColorIndexById?.[r.business_id])?.bg ?? 'bg-white/20',
                            sedeTint(businessColorIndexById?.[r.business_id])?.text ?? 'text-white'
                          )}
                          title={businessNameById[r.business_id]}
                        >
                          {sedeAbbr(businessNameById[r.business_id])}
                        </span>
                      )}
                      {r.type === 'visit' && <Eye className="h-2.5 w-2.5 shrink-0" />}
                      <span className="truncate">{fmt} {client?.name ?? '—'}</span>
                    </div>
                  )
                })}
                {dayRes.length > 4 && (
                  <p className="text-[10px] text-muted-foreground pl-1">+{dayRes.length - 4} {t.calendar.moreLabel}</p>
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
  date, reservations, servicesMap, onSelectReservation, onDayClick, timezone, t, locale, businessNameById, businessColorIndexById,
}: {
  date: Date
  reservations: any[]
  servicesMap: Record<string, Service>
  onSelectReservation: (r: any) => void
  onDayClick: (d: Date) => void
  timezone: string
  t: ReturnType<typeof useLanguage>['t']
  locale: string
  businessNameById?: Record<string, string>
  businessColorIndexById?: Record<string, number>
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
  const dayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        capitalizeFirst(
          new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
            new Date(Date.UTC(1970, 0, 5 + i))
          )
        )
      ),
    [locale]
  )

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
                  const rowColor = service?.color ?? '#3B82F6'
                  return (
                    <div
                      key={r.id}
                      title={getStatusLabel(r.status, t.reservation)}
                      className={cn(
                        'flex w-full items-center gap-0.5 truncate rounded px-1 py-0.5 text-[9px] sm:text-[10px] text-white',
                        statusBorderClass(r.status),
                        (r.status === 'cancelled' || r.status === 'no_show') && 'opacity-45 saturate-50'
                      )}
                      style={r.type === 'visit' ? visitPatternStyle(VISIT_BLOCK_COLOR) : { backgroundColor: rowColor }}
                      onClick={e => { e.stopPropagation(); onSelectReservation(r) }}
                    >
                      {businessNameById?.[r.business_id] && (
                        <span
                          className={cn(
                            'shrink-0 rounded px-0.5 text-[7px] font-bold leading-none',
                            sedeTint(businessColorIndexById?.[r.business_id])?.bg ?? 'bg-white/20',
                            sedeTint(businessColorIndexById?.[r.business_id])?.text ?? 'text-white'
                          )}
                          title={businessNameById[r.business_id]}
                        >
                          {sedeAbbr(businessNameById[r.business_id])}
                        </span>
                      )}
                      {r.type === 'visit' && <Eye className="h-2 w-2 shrink-0" />}
                      <span className="truncate">{fmt}</span>
                    </div>
                  )
                })}
                {dayRes.length > 3 && (
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground pl-1">+{dayRes.length - 3} {t.calendar.moreLabel}</p>
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

function ListView({
  reservations, clientsMap, servicesMap, onSelectReservation, timezone, t, locale, businessNameById, businessColorIndexById,
}: {
  reservations: any[]
  clientsMap: Record<string, Client>
  servicesMap: Record<string, Service>
  onSelectReservation: (r: any) => void
  timezone: string
  t: ReturnType<typeof useLanguage>['t']
  locale: string
  businessNameById?: Record<string, string>
  businessColorIndexById?: Record<string, number>
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
            placeholder={t.calendar.searchByClientOrService}
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
            <SelectItem value="all">{t.calendar.allStatuses}</SelectItem>
            <SelectItem value="pending">{t.reservation.pending}</SelectItem>
            <SelectItem value="confirmed">{t.reservation.confirmed}</SelectItem>
            <SelectItem value="completed">{t.reservation.completed}</SelectItem>
            <SelectItem value="cancelled">{t.reservation.cancelled}</SelectItem>
            <SelectItem value="no_show">{t.reservation.noShow}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.calendar.allTypes}</SelectItem>
            <SelectItem value="booking">{t.reservation.typeBooking}</SelectItem>
            <SelectItem value="visit">{t.reservation.typeVisit}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="whitespace-nowrap p-2 text-left font-medium">{t.calendar.colDate}</th>
              <th className="p-2 text-left font-medium">{t.calendar.colClient}</th>
              <th className="p-2 text-left font-medium">{t.calendar.colService}</th>
              {businessNameById && (
                <th className="p-2 text-left font-medium">{t.calendar.sedeColumnLabel}</th>
              )}
              <th className="p-2 text-left font-medium">{t.calendar.colStatus}</th>
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
                      new Date(r.start_time).toLocaleDateString(locale, { timeZone: timezone, day: 'numeric', month: 'short' })
                    )}{' '}
                    {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}
                  </td>
                  <td className="p-2">{client?.name ?? '—'}</td>
                  <td className="p-2">
                    <span className="flex items-center gap-1.5">
                      {r.type === 'visit' ? (
                        <Eye className="h-3 w-3 shrink-0 text-slate-500" />
                      ) : (
                        service && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: service.color }} />
                      )}
                      {service
                        ? `${r.type === 'visit' ? `${t.calendar.interestedInShortLabel} ` : ''}${service.name}`
                        : r.type === 'visit'
                          ? t.reservation.typeVisit
                          : '—'}
                    </span>
                  </td>
                  {businessNameById && (
                    <td className="p-2">
                      {businessNameById[r.business_id] ? (
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full border px-2 py-0.5 text-xs',
                            sedeTint(businessColorIndexById?.[r.business_id])?.bg,
                            sedeTint(businessColorIndexById?.[r.business_id])?.text,
                            sedeTint(businessColorIndexById?.[r.business_id])?.border
                          )}
                        >
                          {businessNameById[r.business_id]}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  )}
                  <td className="p-2">
                    <StatusBadge status={r.status} labels={t.reservation} />
                  </td>
                  <td className="p-2 text-right">
                    {r.parking_resource_id && <ParkingSquare className="ml-auto h-3.5 w-3.5 text-muted-foreground" />}
                  </td>
                </tr>
              )
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={businessNameById ? 6 : 5} className="p-6 text-center text-muted-foreground">
                  {t.calendar.noReservationsFound}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {t.calendar.pageLabel} {page} {t.calendar.ofLabel} {totalPages} · {filtered.length} {t.calendar.resultsLabel}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              {t.calendar.previousBtn}
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              {t.calendar.nextBtn}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
