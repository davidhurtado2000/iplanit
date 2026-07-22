'use client'

import React, { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CalendarViewComponent } from '@/components/dashboard/calendar-view'
import { ReservationModal } from '@/components/dashboard/reservation-modal'
import { useBusinesses } from '@/hooks/use-businesses'
import { useLanguage } from '@/context/language-context'
import { useDashboardData } from '@/context/dashboard-data-context'
import { getStatusBadgeVariant, getStatusLabel } from '@/lib/reservation-status'
import { capitalizeFirst } from '@/lib/utils'
import type { CalendarView } from '@/lib/types'
import { Plus, CalendarDays, CalendarRange, Calendar as CalendarIcon, Clock, ChevronDown, Building2 } from 'lucide-react'

interface Reservation {
  id: string
  business_id: string
  client_id: string
  service_id: string | null
  resource_id: string | null
  series_id: string | null
  start_time: string
  end_time: string
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed' | 'no_show'
  type: 'booking' | 'visit'
  notes: string | null
  created_at: string
}

interface Client {
  id: string
  name: string
  email: string | null
  phone: string | null
}

interface Service {
  id: string
  name: string
  duration_minutes: number
  price: number
  color: string
}

interface Resource {
  id: string
  name: string
  type: 'room' | 'person' | 'equipment' | 'virtual' | 'parking'
  color: string
}

interface BusinessHour {
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: boolean
}

const VIEW_CONFIG: { value: CalendarView; icon: React.ElementType }[] = [
  { value: 'day', icon: CalendarDays },
  { value: 'week', icon: CalendarRange },
  { value: 'month', icon: CalendarIcon },
]

export default function CalendarPage() {
  const { currentBusiness } = useBusinesses()
  const { t, locale } = useLanguage()
  const {
    reservations,
    clients,
    services,
    resources: allResources,
    calendarStartHour,
    calendarEndHour,
    loading,
    loadingMoreReservations,
    refetchReservations,
    ensureReservationsInRange,
  } = useDashboardData()
  // Parking spots are a resource type but are never the "main" resource a
  // reservation is scheduled against (see needsParking/parking_resource_id
  // in reservation-modal.tsx) - showing them as calendar columns would just
  // be an always-empty column, since no reservation ever sets resource_id
  // to a parking spot.
  const resources = allResources.filter((r) => r.type !== 'parking')
  const [view, setView] = useState<CalendarView>('day')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create')
  const [modalInitialType, setModalInitialType] = useState<'booking' | 'visit'>('booking')

  // Build view options with translated labels
  const VIEW_OPTIONS = VIEW_CONFIG.map(({ value, icon }) => ({
    value,
    icon,
    label: t.calendar[value as 'day' | 'week' | 'month'],
  }))

  const handleCreateReservation = () => {
    setSelectedReservation(null)
    setModalMode('create')
    setModalInitialType('booking')
    setIsModalOpen(true)
  }

  const handleCreateVisit = () => {
    setSelectedReservation(null)
    setModalMode('create')
    setModalInitialType('visit')
    setIsModalOpen(true)
  }

  const handleSelectReservation = (reservation: Reservation) => {
    setSelectedReservation(reservation)
    setModalMode('view')
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedReservation(null)
  }

  const handleVisibleRangeChange = useCallback(
    (from: Date, to: Date) => {
      ensureReservationsInRange(from, to)
    },
    [ensureReservationsInRange]
  )

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!currentBusiness) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Building2 className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">{t.calendar.setupRequired}</h2>
        <p className="mt-2 text-muted-foreground">{t.calendar.setupRequiredDesc}</p>
      </div>
    )
  }

  // Build lookup maps for display
  const clientsMap = Object.fromEntries(clients.map((c) => [c.id, c]))
  const servicesMap = Object.fromEntries(services.map((s) => [s.id, s]))
  const resourcesMap = Object.fromEntries(resources.map((r) => [r.id, r]))

  // Use the business timezone so "today" is correct regardless of UTC offset
  const tz = currentBusiness?.timezone || 'America/Lima'
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
  const todayReservations = reservations.filter((r) => {
    const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(r.start_time))
    return localDate === today && r.status !== 'cancelled'
  })

  const currentViewOption = VIEW_OPTIONS.find((v) => v.value === view)

  return (
    <div className="space-y-4 pb-20 lg:pb-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">{t.calendar.title}</h1>
          <p className="text-sm text-muted-foreground">{t.calendar.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                {currentViewOption && <currentViewOption.icon className="h-4 w-4" />}
                <span className="hidden xs:inline">{t.calendar.view}</span> {currentViewOption?.label}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {VIEW_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => setView(option.value)}
                  className="gap-2"
                >
                  <option.icon className="h-4 w-4" />
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={handleCreateReservation} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t.calendar.newReservation}</span>
            <span className="sm:hidden">{t.calendar.newShort}</span>
          </Button>
          <Button onClick={handleCreateVisit} size="sm" variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t.calendar.newVisit}</span>
            <span className="sm:hidden">{t.calendar.newVisitShort}</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px] lg:gap-6">
        {/* Calendar */}
        <div className="relative">
          {loadingMoreReservations && (
            <div className="absolute right-2 top-2 z-10 rounded-full bg-background/90 px-2.5 py-1 text-xs text-muted-foreground shadow-sm">
              {t.calendar.loadingMore}
            </div>
          )}
          <CalendarViewComponent
            view={view}
            onSelectReservation={handleSelectReservation}
            onViewChange={setView}
            reservations={reservations}
            resources={resources}
            clientsMap={clientsMap}
            servicesMap={servicesMap}
            resourcesMap={resourcesMap}
            startHour={calendarStartHour}
            endHour={calendarEndHour}
            timezone={tz}
            onVisibleRangeChange={handleVisibleRangeChange}
          />
        </div>

        {/* Sidebar - Today's Schedule */}
        <div className="order-first space-y-4 lg:order-last">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t.calendar.today}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {capitalizeFirst(
                  new Date().toLocaleDateString(locale, {
                    timeZone: tz,
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })
                )}
              </p>
            </CardHeader>
            <CardContent className="pb-3">
              {todayReservations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <CalendarDays className="mb-2 h-6 w-6 text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">{t.calendar.noReservationsToday}</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {todayReservations.map((reservation) => {
                    const client = clientsMap[reservation.client_id]
                    const service = reservation.service_id ? servicesMap[reservation.service_id] : undefined
                    return (
                      <button
                        key={reservation.id}
                        type="button"
                        className="w-full rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/50"
                        onClick={() => handleSelectReservation(reservation)}
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className="mt-0.5 w-1 self-stretch min-h-[40px] rounded-full"
                            style={{ backgroundColor: service?.color ?? 'hsl(var(--primary))' }}
                          />
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium truncate">
                                {client?.name ?? t.calendar.unknownClient}
                              </p>
                              <Badge variant={getStatusBadgeVariant(reservation.status)} className="h-4 shrink-0 px-1.5 text-[9px]">
                                {getStatusLabel(reservation.status, t.reservation)}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {service?.name ?? t.calendar.unknownService}
                            </p>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {new Date(reservation.start_time).toLocaleTimeString(locale, {
                                timeZone: tz,
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                              {reservation.end_time && (
                                <>
                                  {' – '}
                                  {new Date(reservation.end_time).toLocaleTimeString(locale, {
                                    timeZone: tz,
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </>
                              )}
                            </span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ReservationModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        reservation={selectedReservation}
        selectedDate={today}
        mode={modalMode}
        onSave={refetchReservations}
        initialType={modalInitialType}
      />
    </div>
  )
}
