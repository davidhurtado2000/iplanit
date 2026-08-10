'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useBusinessContext } from './business-context'
import { useLanguage } from './language-context'
import { playNotificationChime } from '@/lib/notification-sound'

// ---- Shared types used across all dashboard pages ----

export interface Reservation {
  id: string
  business_id: string
  client_id: string
  /** Null for visits with no specific service in mind - see type. */
  service_id: string | null
  resource_id: string | null
  /** Who actually performed the service - independent of resource_id (see
   * Worker above). Null when no specific worker was assigned. */
  worker_id: string | null
  /** Independent of resource_id - a separately-booked parking spot, see
   * scripts/035-parking.sql. Null unless the business offers parking and
   * one was requested/assigned. */
  parking_resource_id: string | null
  series_id: string | null
  /** Set when this booking was created via the "Create follow-up booking"
   * action on a visit (scripts/050-visit-follow-up.sql) - lets a future
   * report compute visit -> booking conversion without guessing from
   * client + rough timing alone. Null for everything else. */
  follow_up_of_reservation_id: string | null
  start_time: string
  end_time: string
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed' | 'no_show'
  /** 'visit' = a prospective client seeing the place before booking - no
   * revenue, excluded from service/revenue analytics, counted separately. */
  type: 'booking' | 'visit'
  /** Price actually used for this reservation, snapshotted at booking time
   * (pre-filled from the service/duration option but editable for one-off
   * quotes) - see lib/analytics.ts for why this replaced reading
   * services.price live. Null for visits. */
  price: number | null
  price_usd: number | null
  cancelled_by: 'client' | 'business' | null
  cancelled_at: string | null
  notes: string | null
  created_at: string
  /** No dedicated confirmed_at column exists - notifications-context.tsx
   * uses this as a "recently confirmed" proxy for status === 'confirmed'.
   * Not perfectly precise (any edit to an already-confirmed reservation
   * also bumps this), but close enough for a notification feed without a
   * schema change. */
  updated_at: string
}

export type ClientDocumentType = 'dni' | 'ruc' | 'ein' | 'passport' | 'other'

export interface Client {
  id: string
  business_id: string
  /** Groups a client across every sede of the same org (scripts/053) -
   * business_id above stays as provenance only (the sede this client
   * record was first created at), no longer the matching/RLS scope. */
  organization_id: string
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  created_at: string
  is_active: boolean
  document_type: ClientDocumentType | null
  document_number: string | null
}

export interface Service {
  id: string
  business_id: string
  name: string
  description: string | null
  duration_minutes: number
  price: number | null
  price_usd: number | null
  color: string
  /** 'fixed' uses this row's own duration_minutes/price/price_usd. 'preset'
   * uses service_duration_options instead. 'hourly' uses hourly_rate(_usd)
   * x a client-chosen whole number of hours within [min_hours, max_hours]. */
  pricing_mode: 'fixed' | 'preset' | 'hourly'
  hourly_rate: number | null
  hourly_rate_usd: number | null
  min_hours: number | null
  max_hours: number | null
  /** Prep/cleanup minutes around this service's own appointments - see
   * scripts/040-appointment-buffers.sql. Both default 0, meaning no gap. */
  buffer_before_min: number
  buffer_after_min: number
  is_active: boolean
  /** Shared by every row that came from duplicating this service (within
   * the same sede or into another one, scripts/054) - null until the first
   * time it's ever duplicated. Every member of the family gets the SAME id
   * (not a parent-pointer chain), so "find every relative" is one flat
   * query regardless of which one was duplicated from which. */
  duplicate_group_id: string | null
}

export interface ServiceDurationOption {
  id: string
  service_id: string
  business_id: string
  duration_minutes: number
  price: number | null
  price_usd: number | null
}

export interface Resource {
  id: string
  business_id: string
  name: string
  description: string | null
  type: 'room' | 'person' | 'equipment' | 'virtual' | 'parking'
  color: string
  is_active: boolean
  /** Same duplicate-family tracking as Service.duplicate_group_id above. */
  duplicate_group_id: string | null
}

export interface ServiceResource {
  id: string
  service_id: string
  resource_id: string
  business_id: string
}

export interface BusinessHour {
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: boolean
}

/** A worker (scripts/057) - deliberately separate from Resource: a resource
 * is a bookable thing (room/equipment/generic "person" slot), a worker is
 * who's actually doing the work. The two aren't tied together - a
 * reservation can have a resource, a worker, both, or neither. */
export interface Worker {
  id: string
  business_id: string
  name: string
  color: string
  is_active: boolean
}

/** A worker's own work schedule - no rows means "follows business_hours",
 * same convention business_hours itself uses for missing days. */
export interface WorkerHour {
  worker_id: string
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: boolean
}

/** Many-to-many: which services a worker is assigned to perform - same
 * shape/purpose as ServiceResource, just for the worker dimension. */
export interface WorkerService {
  id: string
  business_id: string
  worker_id: string
  service_id: string
}

// ---- Context type ----

type DashboardDataContextType = {
  reservations: Reservation[]
  clients: Client[]
  services: Service[]
  resources: Resource[]
  serviceResources: ServiceResource[]
  serviceDurationOptions: ServiceDurationOption[]
  businessHours: BusinessHour[]
  workers: Worker[]
  workerHours: WorkerHour[]
  workerServices: WorkerService[]
  calendarStartHour: number
  calendarEndHour: number
  /** True only while initial data is loading. False forever after first fetch. */
  loading: boolean
  /** True while an on-demand range expansion (see ensureReservationsInRange) is in flight. */
  loadingMoreReservations: boolean
  refetchReservations: () => Promise<void>
  refetchClients: () => Promise<void>
  refetchServicesAndResources: () => Promise<void>
  refetchServiceResources: () => Promise<void>
  refetchServiceDurationOptions: () => Promise<void>
  refetchBusinessHours: () => Promise<void>
  refetchWorkers: () => Promise<void>
  refetchWorkerHours: () => Promise<void>
  refetchWorkerServices: () => Promise<void>
  /**
   * Reservations are only loaded ±RESERVATION_WINDOW_DAYS from when this
   * provider mounted - fetching a business's entire history on every
   * dashboard page load (including ones that don't even show reservations,
   * like Settings) doesn't scale. Call this before relying on reservations
   * outside that window (e.g. the calendar navigating further out); it's a
   * no-op if the requested range is already loaded.
   */
  ensureReservationsInRange: (from: Date, to: Date) => Promise<void>
}

const DashboardDataContext = createContext<DashboardDataContextType | undefined>(undefined)

const supabase = createClient()

const RESERVATION_WINDOW_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000

function getDefaultReservationWindow() {
  const now = Date.now()
  return {
    from: new Date(now - RESERVATION_WINDOW_DAYS * DAY_MS),
    to: new Date(now + RESERVATION_WINDOW_DAYS * DAY_MS),
  }
}

export function DashboardDataProvider({ children }: { children: React.ReactNode }) {
  const { currentBusiness, loading: businessLoading } = useBusinessContext()
  const { t, locale } = useLanguage()
  const router = useRouter()

  const [reservations, setReservations] = useState<Reservation[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [serviceResources, setServiceResources] = useState<ServiceResource[]>([])
  const [serviceDurationOptions, setServiceDurationOptions] = useState<ServiceDurationOption[]>([])
  const [businessHours, setBusinessHours] = useState<BusinessHour[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [workerHours, setWorkerHours] = useState<WorkerHour[]>([])
  const [workerServices, setWorkerServices] = useState<WorkerService[]>([])
  const [calendarStartHour, setCalendarStartHour] = useState(7)
  const [calendarEndHour, setCalendarEndHour] = useState(21)
  const [loading, setLoading] = useState(true)
  const [loadingMoreReservations, setLoadingMoreReservations] = useState(false)
  const [loadedRange, setLoadedRange] = useState<{ from: Date; to: Date } | null>(null)

  const applyBusinessHours = useCallback((hours: BusinessHour[]) => {
    setBusinessHours(hours)

    // Compute calendar start/end hours from business hours
    const activeDays = hours.filter((h) => !h.is_closed)
    if (activeDays.length > 0) {
      const parseHour = (s: string) => parseInt(s.split(':')[0], 10)
      const parseMins = (s: string) => parseInt(s.split(':')[1], 10)
      const start = Math.min(...activeDays.map((h) => parseHour(h.open_time)))
      const rawEnd = Math.max(...activeDays.map((h) => {
        const h2 = parseHour(h.close_time)
        return parseMins(h.close_time) > 0 ? h2 + 1 : h2
      }))
      setCalendarStartHour(start)
      setCalendarEndHour(rawEnd)
    }
  }, [])

  useEffect(() => {
    if (businessLoading) return

    if (!currentBusiness) {
      setLoading(false)
      return
    }

    setLoading(true)
    const fetchAll = async () => {
      try {
        const defaultWindow = getDefaultReservationWindow()
        const [reservationsRes, clientsRes, servicesRes, resourcesRes, hoursRes, workersRes, workerHoursRes, workerServicesRes, serviceResourcesRes, durationOptionsRes] = await Promise.all([
          supabase
            .from('reservations')
            .select('*')
            .eq('business_id', currentBusiness.id)
            .gte('start_time', defaultWindow.from.toISOString())
            .lte('start_time', defaultWindow.to.toISOString())
            .order('start_time', { ascending: true }),
          supabase
            .from('clients')
            .select('*')
            .eq('organization_id', currentBusiness.organization_id)
            .order('name'),
          supabase
            .from('services')
            .select('*')
            .eq('business_id', currentBusiness.id)
            .order('name'),
          supabase
            .from('resources')
            .select('*')
            .eq('business_id', currentBusiness.id)
            .order('name'),
          supabase
            .from('business_hours')
            .select('day_of_week, open_time, close_time, is_closed')
            .eq('business_id', currentBusiness.id),
          supabase
            .from('workers')
            .select('*')
            .eq('business_id', currentBusiness.id)
            .order('name'),
          supabase
            .from('worker_hours')
            .select('worker_id, day_of_week, open_time, close_time, is_closed')
            .eq('business_id', currentBusiness.id),
          supabase
            .from('worker_services')
            .select('*')
            .eq('business_id', currentBusiness.id),
          supabase
            .from('service_resources')
            .select('*')
            .eq('business_id', currentBusiness.id),
          supabase
            .from('service_duration_options')
            .select('*')
            .eq('business_id', currentBusiness.id),
        ])

        setReservations(reservationsRes.data || [])
        setLoadedRange(defaultWindow)
        setClients(clientsRes.data || [])
        setServices(servicesRes.data || [])
        setResources(resourcesRes.data || [])
        setServiceResources(serviceResourcesRes.data || [])
        setServiceDurationOptions(durationOptionsRes.data || [])
        applyBusinessHours(hoursRes.data || [])
        setWorkers(workersRes.data || [])
        setWorkerHours(workerHoursRes.data || [])
        setWorkerServices(workerServicesRes.data || [])
      } catch (err) {
        console.error('[dashboard-data] Error fetching data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchAll()
  }, [currentBusiness?.id, businessLoading])

  // Live toast (+ chime) when a reservation is inserted for this business -
  // mainly for bookings that land via the public link while staff are
  // looking at the dashboard, which otherwise only show up after a manual
  // refresh. Fires for every insert regardless of source (including the
  // staff member's own just-created reservation) rather than trying to
  // distinguish "from the public page" vs "from this dashboard" - simpler,
  // and an extra confirmation toast for your own action isn't harmful.
  // Requires reservations to be added to the supabase_realtime publication
  // (scripts/042-realtime-reservations.sql).
  useEffect(() => {
    if (!currentBusiness) return

    const channel = supabase
      .channel(`reservations-inserts-${currentBusiness.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reservations', filter: `business_id=eq.${currentBusiness.id}` },
        (payload) => {
          const newReservation = payload.new as Reservation
          setReservations((prev) =>
            prev.some((r) => r.id === newReservation.id)
              ? prev
              : [...prev, newReservation].sort((a, b) => a.start_time.localeCompare(b.start_time))
          )
          playNotificationChime()
          toast(t.dashboard.newReservationToast, {
            description: new Date(newReservation.start_time).toLocaleString(locale, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }),
            icon: <CalendarPlus className="h-4 w-4" />,
            duration: 8000,
            style: {
              background: 'var(--primary)',
              color: 'var(--primary-foreground)',
              border: 'none',
            },
            action: {
              label: t.dashboard.newReservationToastCta,
              onClick: () => router.push('/dashboard/calendar'),
            },
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'reservations', filter: `business_id=eq.${currentBusiness.id}` },
        (payload) => {
          const updated = payload.new as Reservation
          const previousStatus = (payload.old as Partial<Reservation>).status
          const reservationId = updated.id
          setReservations((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))

          if (previousStatus === updated.status) return

          // Single source of truth for "a status changed, tell the user" -
          // fires the same way whether the change came from this browser
          // tab or a teammate's, so everyone with the dashboard open stays
          // in sync. Offering Undo here (instead of duplicating this same
          // toast+chime in reservation-modal.tsx's own status-change
          // handler) avoids two toasts stacking for your own action.
          const statusMessages: Partial<Record<Reservation['status'], string>> = {
            pending: t.dashboard.reservationPendingToast,
            confirmed: t.dashboard.reservationConfirmedToast,
            cancelled: t.dashboard.reservationCancelledToast,
            completed: t.dashboard.reservationCompletedToast,
            no_show: t.dashboard.reservationNoShowToast,
          }
          const message = statusMessages[updated.status]
          if (!message) return

          const when = new Date(updated.start_time).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
          const undoAction = previousStatus
            ? {
                label: t.reservation.undoBtn,
                onClick: async () => {
                  const { error } = await supabase
                    .from('reservations')
                    .update({ status: previousStatus })
                    .eq('id', reservationId)
                  if (!error) toast(t.reservation.statusRevertedToast)
                },
              }
            : undefined

          playNotificationChime()
          const toastFn = updated.status === 'cancelled' ? toast.error : updated.status === 'no_show' ? toast.warning : toast.success
          toastFn(message, { description: when, duration: 6500, action: undoAction })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentBusiness?.id, t, locale, router])

  const refetchReservations = useCallback(async () => {
    if (!currentBusiness) return
    // Re-fetch whatever window is currently loaded (default ±90 days, or
    // wider if ensureReservationsInRange already expanded it) rather than
    // the whole table, so this stays cheap after a create/update/delete.
    const range = loadedRange ?? getDefaultReservationWindow()
    const { data } = await supabase
      .from('reservations')
      .select('*')
      .eq('business_id', currentBusiness.id)
      .gte('start_time', range.from.toISOString())
      .lte('start_time', range.to.toISOString())
      .order('start_time', { ascending: true })
    setReservations(data || [])
  }, [currentBusiness?.id, loadedRange])

  const ensureReservationsInRange = useCallback(async (from: Date, to: Date) => {
    if (!currentBusiness) return

    const alreadyCovered =
      loadedRange && from.getTime() >= loadedRange.from.getTime() && to.getTime() <= loadedRange.to.getTime()
    if (alreadyCovered) return

    // Fetch the union of what's already loaded and what's newly needed, so
    // the loaded window only ever grows (no gaps to track).
    const nextFrom = loadedRange ? new Date(Math.min(from.getTime(), loadedRange.from.getTime())) : from
    const nextTo = loadedRange ? new Date(Math.max(to.getTime(), loadedRange.to.getTime())) : to

    setLoadingMoreReservations(true)
    try {
      const { data } = await supabase
        .from('reservations')
        .select('*')
        .eq('business_id', currentBusiness.id)
        .gte('start_time', nextFrom.toISOString())
        .lte('start_time', nextTo.toISOString())
        .order('start_time', { ascending: true })

      if (data) {
        setReservations(data)
        setLoadedRange({ from: nextFrom, to: nextTo })
      }
    } finally {
      setLoadingMoreReservations(false)
    }
  }, [currentBusiness?.id, loadedRange])

  const refetchClients = useCallback(async () => {
    if (!currentBusiness) return
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('organization_id', currentBusiness.organization_id)
      .order('name')
    setClients(data || [])
  }, [currentBusiness?.id, currentBusiness?.organization_id])

  const refetchServicesAndResources = useCallback(async () => {
    if (!currentBusiness) return
    const [servicesRes, resourcesRes] = await Promise.all([
      supabase.from('services').select('*').eq('business_id', currentBusiness.id).order('name'),
      supabase.from('resources').select('*').eq('business_id', currentBusiness.id).order('name'),
    ])
    setServices(servicesRes.data || [])
    setResources(resourcesRes.data || [])
  }, [currentBusiness?.id])

  const refetchServiceResources = useCallback(async () => {
    if (!currentBusiness) return
    const { data } = await supabase
      .from('service_resources')
      .select('*')
      .eq('business_id', currentBusiness.id)
    setServiceResources(data || [])
  }, [currentBusiness?.id])

  const refetchServiceDurationOptions = useCallback(async () => {
    if (!currentBusiness) return
    const { data } = await supabase
      .from('service_duration_options')
      .select('*')
      .eq('business_id', currentBusiness.id)
    setServiceDurationOptions(data || [])
  }, [currentBusiness?.id])

  const refetchBusinessHours = useCallback(async () => {
    if (!currentBusiness) return
    const { data } = await supabase
      .from('business_hours')
      .select('day_of_week, open_time, close_time, is_closed')
      .eq('business_id', currentBusiness.id)
    applyBusinessHours(data || [])
  }, [currentBusiness?.id, applyBusinessHours])

  const refetchWorkers = useCallback(async () => {
    if (!currentBusiness) return
    const { data } = await supabase.from('workers').select('*').eq('business_id', currentBusiness.id).order('name')
    setWorkers(data || [])
  }, [currentBusiness?.id])

  const refetchWorkerHours = useCallback(async () => {
    if (!currentBusiness) return
    const { data } = await supabase
      .from('worker_hours')
      .select('worker_id, day_of_week, open_time, close_time, is_closed')
      .eq('business_id', currentBusiness.id)
    setWorkerHours(data || [])
  }, [currentBusiness?.id])

  const refetchWorkerServices = useCallback(async () => {
    if (!currentBusiness) return
    const { data } = await supabase.from('worker_services').select('*').eq('business_id', currentBusiness.id)
    setWorkerServices(data || [])
  }, [currentBusiness?.id])

  return (
    <DashboardDataContext.Provider
      value={{
        reservations,
        clients,
        services,
        resources,
        serviceResources,
        serviceDurationOptions,
        businessHours,
        workers,
        workerHours,
        workerServices,
        calendarStartHour,
        calendarEndHour,
        loading,
        loadingMoreReservations,
        refetchReservations,
        refetchClients,
        refetchServicesAndResources,
        refetchServiceResources,
        refetchServiceDurationOptions,
        refetchBusinessHours,
        refetchWorkers,
        refetchWorkerHours,
        refetchWorkerServices,
        ensureReservationsInRange,
      }}
    >
      {children}
    </DashboardDataContext.Provider>
  )
}

export function useDashboardData() {
  const ctx = useContext(DashboardDataContext)
  if (!ctx) throw new Error('useDashboardData must be used within DashboardDataProvider')
  return ctx
}
