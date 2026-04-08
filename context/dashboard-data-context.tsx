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
}

export interface Service {
  id: string
  business_id: string
  name: string
  description: string | null
  duration_minutes: number
  price: number | null
  color: string
  is_active: boolean
}

export interface Resource {
  id: string
  business_id: string
  name: string
  description: string | null
  type: 'room' | 'person' | 'equipment'
  is_active: boolean
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
  businessHours: BusinessHour[]
  calendarStartHour: number
  calendarEndHour: number
  /** True only while initial data is loading. False forever after first fetch. */
  loading: boolean
  refetchReservations: () => Promise<void>
  refetchClients: () => Promise<void>
  refetchServicesAndResources: () => Promise<void>
}

const DashboardDataContext = createContext<DashboardDataContextType | undefined>(undefined)

const supabase = createClient()

export function DashboardDataProvider({ children }: { children: React.ReactNode }) {
  const { businesses, loading: businessLoading } = useBusinessContext()
  const currentBusiness = businesses[0]

  const [reservations, setReservations] = useState<Reservation[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [businessHours, setBusinessHours] = useState<BusinessHour[]>([])
  const [calendarStartHour, setCalendarStartHour] = useState(7)
  const [calendarEndHour, setCalendarEndHour] = useState(21)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (businessLoading) return

    if (!currentBusiness) {
      setLoading(false)
      return
    }

    setLoading(true)
    const fetchAll = async () => {
      try {
        const [reservationsRes, clientsRes, servicesRes, resourcesRes, hoursRes] = await Promise.all([
          supabase
            .from('reservations')
            .select('*')
            .eq('business_id', currentBusiness.id)
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
        ])

        setReservations(reservationsRes.data || [])
        setClients(clientsRes.data || [])
        setServices(servicesRes.data || [])
        setResources(resourcesRes.data || [])
        setBusinessHours(hoursRes.data || [])

        // Compute calendar start/end hours from business hours
        const activeDays = (hoursRes.data || []).filter((h: BusinessHour) => !h.is_closed)
        if (activeDays.length > 0) {
          const parseHour = (s: string) => parseInt(s.split(':')[0], 10)
          const parseMins = (s: string) => parseInt(s.split(':')[1], 10)
          const start = Math.min(...activeDays.map((h: BusinessHour) => parseHour(h.open_time)))
          const rawEnd = Math.max(...activeDays.map((h: BusinessHour) => {
            const h2 = parseHour(h.close_time)
            return parseMins(h.close_time) > 0 ? h2 + 1 : h2
          }))
          setCalendarStartHour(start)
          setCalendarEndHour(rawEnd)
        }
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
    const { data } = await supabase
      .from('reservations')
      .select('*')
      .eq('business_id', currentBusiness.id)
      .order('start_time', { ascending: true })
    setReservations(data || [])
  }, [currentBusiness?.id])

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

  return (
    <DashboardDataContext.Provider
      value={{
        reservations,
        clients,
        services,
        resources,
        businessHours,
        calendarStartHour,
        calendarEndHour,
        loading,
        refetchReservations,
        refetchClients,
        refetchServicesAndResources,
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
