'use client'

import { cn } from '@/lib/utils'
import { layoutDay, minutesOfDay, monthGrid, timelineHours } from '@/lib/agenda-calendar'

// Calendar views for the worker portal (/mi-agenda): a month grid, a week
// strip and a day timeline. Read-only, phone-first, and independent of the
// dashboard's calendar (which is tied to the whole business's data) - these
// only draw the worker's own appointments.

export interface CalendarRow {
  id: string
  start_time: string
  end_time: string
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  service_color: string | null
  client_name: string | null
  /** "Corte de cabello + Barba" */
  label: string
}

const HOUR_PX = 56

function weekdayLabels(locale: string): string[] {
  // 2024-01-01 is a Monday.
  return Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2024, 0, 1 + i, 12)).toLocaleDateString(locale, { weekday: 'narrow', timeZone: 'UTC' }).toUpperCase()
  )
}

const dayNumber = (day: string) => Number(day.slice(8, 10))

function DayDots({ rows, fallbackColor }: { rows: CalendarRow[]; fallbackColor: string }) {
  const active = rows.filter((r) => r.status !== 'cancelled')
  return (
    <span className="flex h-2 items-center justify-center gap-0.5">
      {active.slice(0, 4).map((r) => (
        <span
          key={r.id}
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: r.service_color || fallbackColor }}
        />
      ))}
    </span>
  )
}

export function MonthGrid({
  monthStart,
  rowsByDay,
  selectedDay,
  today,
  onSelect,
  locale,
  linkColor,
  extraByDay,
}: {
  monthStart: string
  rowsByDay: Record<string, CalendarRow[]>
  selectedDay: string
  today: string
  onSelect: (day: string) => void
  locale: string
  linkColor: string
  /** Optional small line under the count, e.g. that day's earnings. */
  extraByDay?: Record<string, string>
}) {
  const weeks = monthGrid(monthStart)
  return (
    <div className="rounded-xl border bg-card p-2">
      <div className="grid grid-cols-7 pb-1 text-center text-[11px] font-medium text-muted-foreground">
        {weekdayLabels(locale).map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((day, i) => {
          if (!day) return <span key={`blank-${i}`} />
          const rows = rowsByDay[day] ?? []
          const count = rows.filter((r) => r.status !== 'cancelled').length
          const isSelected = day === selectedDay
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelect(day)}
              aria-label={`${day}${count ? ` · ${count}` : ''}`}
              aria-pressed={isSelected}
              className={cn(
                'flex min-h-[3.75rem] flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 transition-colors',
                isSelected ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted',
                day === today && !isSelected && 'border-primary/40'
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-sm tabular-nums',
                  day === today && 'bg-primary font-semibold text-primary-foreground'
                )}
              >
                {dayNumber(day)}
              </span>
              <DayDots rows={rows} fallbackColor={linkColor} />
              {count > 0 && (
                <span className="text-[10px] font-medium leading-none text-muted-foreground tabular-nums">{count}</span>
              )}
              {extraByDay?.[day] && (
                <span className="text-[9px] font-medium leading-none text-emerald-700 tabular-nums dark:text-emerald-400">
                  {extraByDay[day]}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function WeekStrip({
  weekStart,
  rowsByDay,
  selectedDay,
  today,
  onSelect,
  locale,
  linkColor,
}: {
  weekStart: string
  rowsByDay: Record<string, CalendarRow[]>
  selectedDay: string
  today: string
  onSelect: (day: string) => void
  locale: string
  linkColor: string
}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T12:00:00Z')
    d.setUTCDate(d.getUTCDate() + i)
    return d.toISOString().slice(0, 10)
  })
  const labels = weekdayLabels(locale)
  return (
    <div className="grid grid-cols-7 gap-1 rounded-xl border bg-card p-2">
      {days.map((day, i) => {
        const rows = rowsByDay[day] ?? []
        const count = rows.filter((r) => r.status !== 'cancelled').length
        const isSelected = day === selectedDay
        return (
          <button
            key={day}
            type="button"
            onClick={() => onSelect(day)}
            aria-pressed={isSelected}
            className={cn(
              'flex flex-col items-center gap-1 rounded-lg border py-2 transition-colors',
              isSelected ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted'
            )}
          >
            <span className="text-[11px] font-medium text-muted-foreground">{labels[i]}</span>
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-sm tabular-nums',
                day === today && 'bg-primary font-semibold text-primary-foreground'
              )}
            >
              {dayNumber(day)}
            </span>
            <DayDots rows={rows} fallbackColor={linkColor} />
            <span className="h-3 text-[10px] font-medium leading-none text-muted-foreground tabular-nums">
              {count > 0 ? count : ''}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function DayTimeline({
  rows,
  tz,
  locale,
  linkColor,
  onOpen,
  now,
}: {
  rows: CalendarRow[]
  tz: string
  locale: string
  linkColor: string
  onOpen: (id: string) => void
  /** Draws a "now" line when this day is today. */
  now?: Date | null
}) {
  const items = layoutDay(rows, tz)
  const { startHour, endHour } = timelineHours(items)
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
  const top = (minutes: number) => ((minutes - startHour * 60) / 60) * HOUR_PX
  // 24-hour like the hour labels on the left, so the block and the grid agree.
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const nowMinutes = now ? minutesOfDay(now.toISOString(), tz) : null

  return (
    <div className="relative overflow-hidden rounded-xl border bg-card" style={{ height: hours.length * HOUR_PX }}>
      {hours.map((h) => (
        <div key={h} className="absolute inset-x-0 border-t border-border/50" style={{ top: (h - startHour) * HOUR_PX }}>
          <span className="absolute left-2 top-0.5 text-[10px] text-muted-foreground tabular-nums">
            {String(h).padStart(2, '0')}:00
          </span>
        </div>
      ))}

      {nowMinutes !== null && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60 && (
        <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: top(nowMinutes) }}>
          <span className="ml-10 h-2 w-2 -translate-x-1 rounded-full bg-red-500" />
          <span className="h-px flex-1 bg-red-500" />
        </div>
      )}

      {/* Appointments live right of the hour labels. */}
      <div className="absolute inset-y-0 left-12 right-2">
        {items.map(({ row, start, end, lane, lanes }) => {
          const inactive = row.status === 'cancelled' || row.status === 'no_show'
          const color = row.service_color || linkColor
          const height = Math.max(((end - start) / 60) * HOUR_PX - 2, 22)
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onOpen(row.id)}
              className={cn(
                'absolute overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left text-white shadow-sm transition-all hover:brightness-110',
                inactive && 'opacity-50 saturate-50'
              )}
              style={{
                top: top(start) + 1,
                height,
                left: `${(lane / lanes) * 100}%`,
                width: `calc(${100 / lanes}% - 2px)`,
                backgroundColor: color,
                borderLeftColor: 'rgba(255,255,255,0.55)',
              }}
            >
              <p className={cn('truncate text-xs font-semibold leading-tight', row.status === 'cancelled' && 'line-through')}>
                {row.client_name || '—'}
              </p>
              {height >= 40 && <p className="truncate text-[10px] leading-tight opacity-90">{row.label}</p>}
              {height >= 56 && (
                <p className="text-[10px] leading-tight opacity-80">
                  {fmt(row.start_time)} – {fmt(row.end_time)}
                </p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
