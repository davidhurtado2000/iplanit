'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBusinessContext } from './business-context'

// ---- Shared types used across all dashboard pages ----

export interface Reservation {
  id: string
  business_id: string
  client_id: string
  service_id: string
  resource_id: string | null
  series_id: string | null
  start_time: string
  end_time: string
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed'
  notes: string | null
  created_at: string
}

export interface Client {
  id: string
  business_id: string
  name: string
  email: string
  phone: string | null
  notes: string | null
  created_at: string
  is_active: boolean
  dni: string | null
  ruc: string | null
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
  is_active: boolean
}

export interface Resource {
  id: string
  business_id: string
  name: string
  description: string | null
  type: 'room' | 'person' | 'equipment' | 'virtual'
  color: string
  is_active: boolean
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

// ---- Context type ----

type DashboardDataContextType = {
  reservations: Reservation[]
  clients: Client[]
  services: Service[]
  resources: Resource[]
  serviceResources: ServiceResource[]
  businessHours: BusinessHour[]
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
  refetchBusinessHours: () => Promise<void>
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
  const { businesses, loading: businessLoading } = useBusinessContext()
  const currentBusiness = businesses[0]

  const [reservations, setReservations] = useState<Reservation[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [serviceResources, setServiceResources] = useState<ServiceResource[]>([])
  const [businessHours, setBusinessHours] = useState<BusinessHour[]>([])
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
        const [reservationsRes, clientsRes, servicesRes, resourcesRes, hoursRes, serviceResourcesRes] = await Promise.all([
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
            .eq('business_id', currentBusiness.id)
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
            .from('service_resources')
            .select('*')
            .eq('business_id', currentBusiness.id),
        ])

        setReservations(reservationsRes.data || [])
        setLoadedRange(defaultWindow)
        setClients(clientsRes.data || [])
        setServices(servicesRes.data || [])
        setResources(resourcesRes.data || [])
        setServiceResources(serviceResourcesRes.data || [])
        applyBusinessHours(hoursRes.data || [])
      } catch (err) {
        console.error('[dashboard-data] Error fetching data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchAll()
  }, [currentBusiness?.id, businessLoading])

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
      .eq('business_id', currentBusiness.id)
      .order('name')
    setClients(data || [])
  }, [currentBusiness?.id])

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

  const refetchBusinessHours = useCallback(async () => {
    if (!currentBusiness) return
    const { data } = await supabase
      .from('business_hours')
      .select('day_of_week, open_time, close_time, is_closed')
      .eq('business_id', currentBusiness.id)
    applyBusinessHours(data || [])
  }, [currentBusiness?.id, applyBusinessHours])

  return (
    <DashboardDataContext.Provider
      value={{
        reservations,
        clients,
        services,
        resources,
        serviceResources,
        businessHours,
        calendarStartHour,
        calendarEndHour,
        loading,
        loadingMoreReservations,
        refetchReservations,
        refetchClients,
        refetchServicesAndResources,
        refetchServiceResources,
        refetchBusinessHours,
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
