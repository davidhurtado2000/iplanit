'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { createClient } from '@/lib/supabase/client'
import type { CalendarView } from '@/lib/types'
import { Plus, CalendarDays, CalendarRange, Calendar as CalendarIcon, Clock, ChevronDown, MapPin, User, Loader2, Building2 } from 'lucide-react'

interface Reservation {
  id: string
  business_id: string
  client_id: string
  service_id: string
  resource_id: string | null
  start_time: string
  end_time: string
  status: 'confirmed' | 'pending' | 'cancelled'
  notes: string | null
  created_at: string
}

const VIEW_OPTIONS: { value: CalendarView; label: string; icon: React.ElementType }[] = [
  { value: 'day', label: 'Dia', icon: CalendarDays },
  { value: 'week', label: 'Semana', icon: CalendarRange },
  { value: 'month', label: 'Mes', icon: CalendarIcon },
]

export default function CalendarPage() {
  const { businesses, loading: businessLoading } = useBusinesses()
  const [view, setView] = useState<CalendarView>('day')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create')
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const currentBusiness = businesses?.[0]

  // Fetch reservations from Supabase
  useEffect(() => {
    const fetchReservations = async () => {
      if (!currentBusiness) {
        setLoading(false)
        return
      }

      try {
        const { data, error } = await supabase
          .from('reservations')
          .select('*')
          .eq('business_id', currentBusiness.id)
          .order('start_time', { ascending: true })

        if (error) throw error
        if (data) {
          setReservations(data)
        }
      } catch (err) {
        console.error('[v0] Error fetching reservations:', err)
      } finally {
        setLoading(false)
      }
    }

    if (!businessLoading) {
      fetchReservations()
    }
  }, [currentBusiness, businessLoading])

  const handleCreateReservation = () => {
    setSelectedReservation(null)
    setModalMode('create')
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

  if (businessLoading || loading) {
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
        <h2 className="text-xl font-semibold">Configura tu negocio primero</h2>
        <p className="mt-2 text-muted-foreground">
          Necesitas configurar tu negocio antes de crear reservas
        </p>
      </div>
    )
  }

  const today = new Date().toISOString().split('T')[0]
  const todayReservations = reservations.filter((r) => {
    const resDate = r.start_time.split('T')[0]
    return resDate === today && r.status !== 'cancelled'
  })

  const currentViewOption = VIEW_OPTIONS.find((v) => v.value === view)

  return (
    <div className="space-y-4 pb-20 lg:pb-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">Calendario</h1>
            <p className="text-sm text-muted-foreground">
              Gestiona tus reservas y citas
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                  {currentViewOption && <currentViewOption.icon className="h-4 w-4" />}
                  <span className="hidden xs:inline">Vista</span> {currentViewOption?.label}
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
              <span className="hidden sm:inline">Nueva Reserva</span>
              <span className="sm:hidden">Nueva</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px] lg:gap-6">
        {/* Calendar */}
        <CalendarViewComponent
          view={view}
          onSelectReservation={handleSelectReservation}
          onViewChange={setView}
          reservations={reservations}
        />

        {/* Sidebar - Today's Schedule */}
        <div className="order-first space-y-4 lg:order-last">
          {/* Today's Schedule */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Hoy</CardTitle>
              <p className="text-xs text-muted-foreground">
                {new Date().toLocaleDateString('es-ES', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </p>
            </CardHeader>
            <CardContent className="pb-3">
              {todayReservations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <CalendarDays className="mb-2 h-6 w-6 text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">
                    No hay reservas para hoy
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {todayReservations.map((reservation) => (
                    <button
                      key={reservation.id}
                      type="button"
                      className="w-full rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/50"
                      onClick={() => handleSelectReservation(reservation)}
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 h-full w-1 rounded-full self-stretch min-h-[40px] bg-primary" />
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <p className="text-sm font-medium truncate">{reservation.id}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            Estado: {reservation.status}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(reservation.start_time).toLocaleTimeString('es-ES', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Reservation Modal */}
      
      <ReservationModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        reservation={selectedReservation}
        selectedDate={today}
        mode={modalMode}
      />
    </div>
  )
}
