'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight, User, Clock, MapPin, CalendarDays } from 'lucide-react'
import type { CalendarView } from '@/lib/types'
import { cn } from '@/lib/utils'

interface CalendarViewProps {
  view: CalendarView
  onSelectReservation: (reservation: any) => void
  onViewChange?: (view: CalendarView) => void
  reservations: any[]
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8) // 8:00 to 19:00

export function CalendarViewComponent({ view, onSelectReservation, onViewChange, reservations }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedResourceId, setSelectedResourceId] = useState<string>('all')
  const [selectedDayFromMonth, setSelectedDayFromMonth] = useState<Date | null>(null)

  const activeResources: any[] = []

  const navigatePrev = () => {
    const newDate = new Date(currentDate)
    if (view === 'day') {
      newDate.setDate(newDate.getDate() - 1)
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() - 7)
    } else {
      newDate.setMonth(newDate.getMonth() - 1)
    }
    setCurrentDate(newDate)
  }

  const navigateNext = () => {
    const newDate = new Date(currentDate)
    if (view === 'day') {
      newDate.setDate(newDate.getDate() + 1)
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() + 7)
    } else {
      newDate.setMonth(newDate.getMonth() + 1)
    }
    setCurrentDate(newDate)
  }

  const goToToday = () => {
    setCurrentDate(new Date())
    setSelectedDayFromMonth(null)
  }

  const handleDayClick = (date: Date) => {
    setSelectedDayFromMonth(date)
    setCurrentDate(date)
    if (onViewChange) {
      onViewChange('day')
    }
  }

  const handleBackToMonth = () => {
    setSelectedDayFromMonth(null)
    if (onViewChange) {
      onViewChange('month')
    }
  }

  const formatDateHeader = () => {
    if (view === 'day') {
      return currentDate.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    } else if (view === 'week') {
      const startOfWeek = new Date(currentDate)
      const day = startOfWeek.getDay()
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1)
      startOfWeek.setDate(diff)
      const endOfWeek = new Date(startOfWeek)
      endOfWeek.setDate(endOfWeek.getDate() + 6)
      return `${startOfWeek.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} - ${endOfWeek.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
    } else {
      return currentDate.toLocaleDateString('es-ES', {
        month: 'long',
        year: 'numeric',
      })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Calendar Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={navigatePrev} className="h-8 w-8 bg-transparent">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={navigateNext} className="h-8 w-8 bg-transparent">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToToday}>
            Hoy
          </Button>
        </div>
        <h2 className="text-base font-semibold capitalize sm:text-lg">{formatDateHeader()}</h2>
        
        {/* Resource filter - only for day view */}
        {view === 'day' && (
          <Select value={selectedResourceId} onValueChange={setSelectedResourceId}>
            <SelectTrigger className="w-full bg-transparent sm:w-[180px]">
              <SelectValue placeholder="Filtrar por recurso" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los recursos</SelectItem>
              {activeResources.map((resource) => (
                <SelectItem key={resource.id} value={resource.id}>
                  {resource.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Calendar Content */}
      {view === 'day' && (
        <DayViewByResource
          date={currentDate}
          onSelectReservation={onSelectReservation}
          selectedResourceId={selectedResourceId}
          reservations={reservations}
        />
      )}
      {view === 'week' && (
        <WeekView
          date={currentDate}
          onSelectReservation={onSelectReservation}
          onDayClick={handleDayClick}
          reservations={reservations}
        />
      )}
      {view === 'month' && (
        <MonthView
          date={currentDate}
          onSelectReservation={onSelectReservation}
          onDayClick={handleDayClick}
          reservations={reservations}
        />
      )}
    </div>
  )
}

// New Day View with columns per resource
function DayViewByResource({
  date,
  onSelectReservation,
  selectedResourceId,
  reservations,
}: {
  date: Date
  onSelectReservation: (reservation: any) => void
  selectedResourceId: string
  reservations: any[]
}) {
  const dateStr = date.toISOString().split('T')[0]
  const activeResources: any[] = []
  
  // Filter resources based on selection
  const displayResources = selectedResourceId === 'all' 
    ? activeResources 
    : activeResources.filter((r: any) => r.id === selectedResourceId)

  const dayReservations = reservations.filter(
    (r) => r.start_time.split('T')[0] === dateStr && r.status !== 'cancelled'
  )

  // Show simplified day view for now (resources feature not fully implemented)
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="space-y-3">
        {dayReservations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CalendarDays className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-muted-foreground">No hay reservas para este día</p>
          </div>
        ) : (
          dayReservations.map((reservation) => (
            <button
              key={reservation.id}
              type="button"
              className="w-full rounded-lg border p-4 text-left transition-colors hover:bg-muted/50"
              onClick={() => onSelectReservation(reservation)}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1 h-full w-1 rounded-full bg-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Reserva: {reservation.id}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(reservation.start_time).toLocaleTimeString('es-ES', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize mt-1">
                    Estado: {reservation.status}
                  </p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function WeekView({
  date,
  onSelectReservation,
  onDayClick,
  reservations,
}: {
  date: Date
  onSelectReservation: (reservation: any) => void
  onDayClick: (date: Date) => void
  reservations: any[]
}) {
  const weekDays = useMemo(() => {
    const days = []
    const startOfWeek = new Date(date)
    const day = startOfWeek.getDay()
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1)
    startOfWeek.setDate(diff)

    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek)
      d.setDate(d.getDate() + i)
      days.push(d)
    }
    return days
  }, [date])

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <div
        className="grid min-w-[600px]"
        style={{ gridTemplateColumns: '60px repeat(7, 1fr)' }}
      >
        {/* Header */}
        <div className="border-b border-r bg-muted/30 p-2" />
        {weekDays.map((d) => {
          const dateStr = d.toISOString().split('T')[0]
          const isToday = dateStr === today
          const dayReservations = reservations.filter(
            (r) => r.start_time.split('T')[0] === dateStr && r.status !== 'cancelled'
          )
          return (
            <button
              type="button"
              key={dateStr}
              className={cn(
                'border-b border-r p-2 text-center transition-colors hover:bg-muted/50 cursor-pointer',
                isToday && 'bg-primary/10 hover:bg-primary/20'
              )}
              onClick={() => onDayClick(d)}
            >
              <p className="text-xs text-muted-foreground">
                {d.toLocaleDateString('es-ES', { weekday: 'short' })}
              </p>
              <p
                className={cn(
                  'text-lg font-semibold',
                  isToday && 'text-primary'
                )}
              >
                {d.getDate()}
              </p>
              {dayReservations.length > 0 && (
                <Badge variant="secondary" className="mt-1 text-[10px] h-5">
                  {dayReservations.length} cita{dayReservations.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </button>
          )
        })}


      </div>
    </div>
  )
}

function MonthView({
  date,
  onSelectReservation,
  onDayClick,
  reservations,
}: {
  date: Date
  onSelectReservation: (reservation: any) => void
  onDayClick: (date: Date) => void
  reservations: any[]
}) {
  const monthDays = useMemo(() => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)

    const days = []
    const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1

    // Previous month days
    for (let i = startDay - 1; i >= 0; i--) {
      const d = new Date(year, month, -i)
      days.push({ date: d, isCurrentMonth: false })
    }

    // Current month days
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true })
    }

    // Next month days
    const remaining = 42 - days.length
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false })
    }

    return days
  }, [date])

  const today = new Date().toISOString().split('T')[0]
  const weekDays = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
  const weekDaysLong = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']

  return (
    <div className="rounded-lg border bg-card">
      {/* Week day headers */}
      <div className="grid grid-cols-7 border-b">
        {weekDays.map((day, index) => (
          <div
            key={day}
            className="p-2 text-center text-xs font-medium text-muted-foreground sm:text-sm"
          >
            <span className="sm:hidden">{day}</span>
            <span className="hidden sm:inline">{weekDaysLong[index]}</span>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {monthDays.map(({ date: d, isCurrentMonth }, index) => {
          const dateStr = d.toISOString().split('T')[0]
          const isToday = dateStr === today
          const dayReservations = reservations.filter(
            (r) => r.start_time.split('T')[0] === dateStr && r.status !== 'cancelled'
          )

          return (
            <button
              type="button"
              key={index}
              className={cn(
                'min-h-16 border-b border-r p-1 sm:min-h-24 text-left transition-colors hover:bg-muted/40 cursor-pointer group',
                !isCurrentMonth && 'bg-muted/30 hover:bg-muted/50'
              )}
              onClick={() => onDayClick(d)}
            >
              <div
                className={cn(
                  'mb-1 flex h-5 w-5 items-center justify-center rounded-full text-xs sm:h-6 sm:w-6 sm:text-sm transition-colors',
                  isToday && 'bg-primary text-primary-foreground',
                  !isCurrentMonth && 'text-muted-foreground',
                  !isToday && 'group-hover:bg-muted'
                )}
              >
                {d.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayReservations.slice(0, 2).map((reservation) => {
                  return (
                    <div
                      key={reservation.id}
                      className="w-full truncate rounded px-1 py-0.5 text-left text-[10px] text-white sm:text-xs bg-primary"
                    >
                      <span className="sm:hidden">
                        {new Date(reservation.start_time).getHours()}h
                      </span>
                      <span className="hidden sm:inline">
                        {new Date(reservation.start_time).toLocaleTimeString('es-ES', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  )
                })}
                {dayReservations.length > 2 && (
                  <p className="text-[10px] text-muted-foreground sm:text-xs">
                    +{dayReservations.length - 2} mas
                  </p>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
