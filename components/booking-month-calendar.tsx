'use client'

import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { capitalizeFirst, cn } from '@/lib/utils'

// Airline-style month picker for the public booking link: every day shows
// up front whether it has any room left, so a client picks the day that
// suits them instead of stepping day by day from "today". Days are plain
// 'YYYY-MM-DD' calendar dates (business-local), never Date objects, so the
// grid can't drift a day across timezones.

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function addMonths(dateStr: string, months: number) {
  const d = new Date(dateStr.slice(0, 8) + '01T12:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

// Weekday of a calendar date - read in UTC since the date has no timezone.
function dayOfWeek(dateStr: string) {
  return new Date(dateStr + 'T12:00:00Z').getUTCDay()
}

export function BookingMonthCalendar({
  month,
  today,
  slotsByDay,
  loading,
  selectedDate,
  weekStartsMonday,
  locale,
  onSelectDate,
  onMonthChange,
  labels,
}: {
  /** 'YYYY-MM-01' */
  month: string
  today: string
  slotsByDay: Record<string, Date[]>
  loading: boolean
  selectedDate: string
  weekStartsMonday: boolean
  locale: string
  onSelectDate: (date: string) => void
  onMonthChange: (month: string) => void
  labels: { previousMonth: string; nextMonth: string; noAvailability: string }
}) {
  if (!month) return null

  const nextMonth = addMonths(month, 1)
  const offset = (dayOfWeek(month) - (weekStartsMonday ? 1 : 0) + 7) % 7
  const days: string[] = []
  for (let d = month; d < nextMonth; d = addDays(d, 1)) days.push(d)
  const cells: (string | null)[] = [...Array(offset).fill(null), ...days]

  // A known Monday (2024-01-01) / Sunday (2023-12-31) to build localized
  // narrow weekday headers in the right order.
  const firstHeader = weekStartsMonday ? '2024-01-01' : '2023-12-31'
  const weekdayHeaders = Array.from({ length: 7 }, (_, i) =>
    new Date(addDays(firstHeader, i) + 'T12:00:00Z').toLocaleDateString(locale, { timeZone: 'UTC', weekday: 'narrow' })
  )
  const canGoBack = month > today.slice(0, 8) + '01'

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onMonthChange(addMonths(month, -1))}
          disabled={!canGoBack}
          aria-label={labels.previousMonth}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="flex items-center gap-2 text-sm font-semibold">
          {capitalizeFirst(
            new Date(month + 'T12:00:00Z').toLocaleDateString(locale, { timeZone: 'UTC', month: 'long', year: 'numeric' })
          )}
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onMonthChange(nextMonth)}
          aria-label={labels.nextMonth}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {weekdayHeaders.map((label, i) => (
          <span key={i} className="pb-1 text-[11px] font-medium uppercase text-muted-foreground" aria-hidden>
            {label}
          </span>
        ))}
        {cells.map((date, i) => {
          if (!date) return <span key={`blank-${i}`} />
          const isPast = date < today
          const hasRoom = (slotsByDay[date]?.length ?? 0) > 0
          const disabled = isPast || loading || !hasRoom
          const isSelected = date === selectedDate
          const fullLabel = new Date(date + 'T12:00:00Z').toLocaleDateString(locale, {
            timeZone: 'UTC',
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })
          return (
            <button
              key={date}
              type="button"
              disabled={disabled}
              onClick={() => onSelectDate(date)}
              aria-pressed={isSelected}
              aria-label={!isPast && !loading && !hasRoom ? `${fullLabel} - ${labels.noAvailability}` : fullLabel}
              className={cn(
                'relative flex h-10 items-center justify-center rounded-md text-sm transition-colors',
                isSelected
                  ? 'bg-primary font-semibold text-primary-foreground'
                  : disabled
                    ? 'cursor-not-allowed text-muted-foreground/40'
                    : 'font-medium text-foreground hover:bg-muted',
                date === today && !isSelected && 'ring-1 ring-inset ring-border'
              )}
            >
              {Number(date.slice(8, 10))}
              {/* Small dot = has times; reinforces the enabled state
                  beyond color/weight alone. */}
              {hasRoom && !isPast && !isSelected && (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-primary" aria-hidden />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
