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
import { ChevronLeft, ChevronRight, User, Clock, MapPin } from 'lucide-react'
import {
  reservations,
  resources,
  getServiceById,
  getClientById,
  getResourceById,
} from '@/lib/mock-data'
import type { Reservation, CalendarView, Resource } from '@/lib/types'
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
        />
      )}
      {view === 'week' && (
        <WeekView
          date={currentDate}
          onSelectReservation={onSelectReservation}
          onDayClick={handleDayClick}
        />
      )}
      {view === 'month' && (
        <MonthView
          date={currentDate}
          onSelectReservation={onSelectReservation}
          onDayClick={handleDayClick}
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
}: {
  date: Date
  onSelectReservation: (reservation: Reservation) => void
  selectedResourceId: string
}) {
  const dateStr = date.toISOString().split('T')[0]
  const activeResources = resources.filter((r) => r.isActive)
  
  // Filter resources based on selection
  const displayResources = selectedResourceId === 'all' 
    ? activeResources 
    : activeResources.filter(r => r.id === selectedResourceId)

  const dayReservations = reservations.filter(
    (r) => r.date === dateStr && r.status !== 'cancelled'
  )

  // Group reservations by resource
  const reservationsByResource = useMemo(() => {
    const grouped: Record<string, Reservation[]> = {}
    displayResources.forEach((resource) => {
      grouped[resource.id] = dayReservations.filter(
        (r) => r.resourceId === resource.id
      )
    })
    // Also include reservations without a resource assigned
    grouped['unassigned'] = dayReservations.filter((r) => !r.resourceId)
    return grouped
  }, [dayReservations, displayResources])

  const getResourceIcon = (type: Resource['type']) => {
    switch (type) {
      case 'room':
        return <MapPin className="h-3 w-3" />
      case 'person':
        return <User className="h-3 w-3" />
      default:
        return null
    }
  }

  const getResourceColor = (index: number) => {
    const colors = [
      'bg-blue-50 border-blue-200',
      'bg-emerald-50 border-emerald-200',
      'bg-amber-50 border-amber-200',
      'bg-rose-50 border-rose-200',
    ]
    return colors[index % colors.length]
  }

  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <div
        className="grid min-w-[600px]"
        style={{ gridTemplateColumns: `80px repeat(${displayResources.length}, 1fr)` }}
      >
        {/* Header row with resource names */}
        <div className="border-b border-r bg-muted/30 p-2" />
        {displayResources.map((resource, index) => (
          <div
            key={resource.id}
            className={cn(
              'border-b border-r p-3 text-center',
              getResourceColor(index)
            )}
          >
            <div className="flex items-center justify-center gap-1.5">
              {getResourceIcon(resource.type)}
              <span className="text-sm font-medium truncate">{resource.name}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 capitalize">
              {resource.type === 'room' ? 'Sala' : resource.type === 'person' ? 'Personal' : 'Equipo'}
            </p>
          </div>
        ))}

        {/* Time slots */}
        {HOURS.map((hour) => (
          <div key={hour} className="contents">
            <div className="flex h-20 items-start justify-end border-b border-r px-2 pt-1 text-xs text-muted-foreground">
              {hour}:00
            </div>
            {displayResources.map((resource, resourceIndex) => {
              const hourReservations = reservationsByResource[resource.id]?.filter(
                (r) => {
                  const startHour = parseInt(r.startTime.split(':')[0])
                  return startHour === hour
                }
              ) || []

              return (
                <div
                  key={`${resource.id}-${hour}`}
                  className={cn(
                    'relative h-20 border-b border-r p-0.5',
                    resourceIndex % 2 === 1 && 'bg-muted/10'
                  )}
                >
                  {hourReservations.map((reservation) => {
                    const service = getServiceById(reservation.serviceId)
                    const client = getClientById(reservation.clientId)
                    const startMin = parseInt(reservation.startTime.split(':')[1])
                    const endHour = parseInt(reservation.endTime.split(':')[0])
                    const endMin = parseInt(reservation.endTime.split(':')[1])
                    
                    const top = (startMin / 60) * 80
                    const duration = ((endHour - hour) * 60 + (endMin - startMin))
                    const height = (duration / 60) * 80

                    return (
                      <button
                        key={reservation.id}
                        type="button"
                        className="absolute left-0.5 right-0.5 cursor-pointer rounded-md p-2 text-left transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
                        style={{
                          top: `${top}px`,
                          height: `${Math.max(height, 32)}px`,
                          backgroundColor: service?.color || '#3B82F6',
                        }}
                        onClick={() => onSelectReservation(reservation)}
                      >
                        <div className="flex items-start gap-1">
                          <div
                            className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-white/30"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-white">
                              {client?.name}
                            </p>
                            <p className="truncate text-[10px] text-white/80">
                              {service?.name}
                            </p>
                            <p className="text-[10px] text-white/70 flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5" />
                              {reservation.startTime}
                            </p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function WeekView({
  date,
  onSelectReservation,
  onDayClick,
}: {
  date: Date
  onSelectReservation: (reservation: Reservation) => void
  onDayClick: (date: Date) => void
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
            (r) => r.date === dateStr && r.status !== 'cancelled'
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

        {/* Time slots */}
        {HOURS.map((hour) => (
          <div key={`time-row-${hour}`} className="contents">
            <div
              className="flex h-14 items-start justify-end border-b border-r px-1 pt-1 text-[10px] text-muted-foreground sm:px-2 sm:text-xs"
            >
              {hour}:00
            </div>
            {weekDays.map((d) => {
              const dateStr = d.toISOString().split('T')[0]
              const hourReservations = reservations.filter((r) => {
                if (r.date !== dateStr || r.status === 'cancelled') return false
                const startHour = parseInt(r.startTime.split(':')[0])
                return startHour === hour
              })

              return (
                <div
                  key={`${dateStr}-${hour}`}
                  className="relative h-14 border-b border-r p-0.5"
                >
                  {hourReservations.map((reservation) => {
                    const service = getServiceById(reservation.serviceId)
                    const client = getClientById(reservation.clientId)
                    const resource = getResourceById(reservation.resourceId || '')
                    return (
                      <button
                        key={reservation.id}
                        type="button"
                        className="w-full cursor-pointer rounded p-1 text-left text-[10px] transition-opacity hover:opacity-80 sm:text-xs"
                        style={{
                          backgroundColor: service?.color || '#3B82F6',
                        }}
                        onClick={() => onSelectReservation(reservation)}
                      >
                        <p className="truncate font-medium text-white">
                          {reservation.startTime}
                        </p>
                        <p className="truncate text-white/80 hidden sm:block">{client?.name}</p>
                        {resource && (
                          <p className="truncate text-white/60 hidden md:block">{resource.name}</p>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function MonthView({
  date,
  onSelectReservation,
  onDayClick,
}: {
  date: Date
  onSelectReservation: (reservation: Reservation) => void
  onDayClick: (date: Date) => void
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
            (r) => r.date === dateStr && r.status !== 'cancelled'
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
                  const service = getServiceById(reservation.serviceId)
                  const resource = getResourceById(reservation.resourceId || '')
                  return (
                    <div
                      key={reservation.id}
                      className="w-full truncate rounded px-1 py-0.5 text-left text-[10px] text-white sm:text-xs"
                      style={{
                        backgroundColor: service?.color || '#3B82F6',
                      }}
                    >
                      <span className="sm:hidden">{reservation.startTime.slice(0, 2)}h</span>
                      <span className="hidden sm:inline">
                        {reservation.startTime} {resource?.name ? `- ${resource.name.slice(0, 8)}` : ''}
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
