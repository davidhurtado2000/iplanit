// Core Types for iPlannit

export type UserRole = 'owner' | 'staff'
export type PlanType = 'free' | 'premium'
export type BusinessType = 'coworking' | 'clinic' | 'professional'
export type ReservationStatus = 'confirmed' | 'cancelled' | 'rescheduled'
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  timezone: string
  language: 'es' | 'en'
  plan: PlanType
  createdAt: string
  avatarUrl?: string
}

export interface Business {
  id: string
  name: string
  type: BusinessType
  timezone: string
  ownerId: string
  businessHours: BusinessHours[]
  createdAt: string
  address?: string
  phone?: string
  email?: string
}

export interface BusinessHours {
  dayOfWeek: DayOfWeek
  startTime: string // HH:mm format
  endTime: string // HH:mm format
  isOpen: boolean
}

export interface Service {
  id: string
  businessId: string
  name: string
  description?: string
  duration: number // in minutes
  price?: number
  currency?: string
  isActive: boolean
  color: string
}

export interface Resource {
  id: string
  businessId: string
  name: string
  type: 'room' | 'person' | 'equipment'
  description?: string
  isActive: boolean
}

export interface Client {
  id: string
  businessId: string
  name: string
  email: string
  phone?: string
  notes?: string
  createdAt: string
}

export interface Reservation {
  id: string
  businessId: string
  serviceId: string
  clientId: string
  resourceId?: string
  date: string // ISO date string
  startTime: string // HH:mm format
  endTime: string // HH:mm format
  status: ReservationStatus
  notes?: string
  createdAt: string
  updatedAt: string
}

// Dashboard Analytics Types (Premium)
export interface DashboardStats {
  totalReservations: number
  reservationsToday: number
  reservationsThisWeek: number
  reservationsThisMonth: number
  topServices: { serviceId: string; serviceName: string; count: number }[]
  peakHours: { hour: number; count: number }[]
  revenue?: {
    today: number
    thisWeek: number
    thisMonth: number
    currency: string
  }
}

// Calendar View Types
export type CalendarView = 'day' | 'week' | 'month'

export interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  color: string
  reservation: Reservation
  service: Service
  client: Client
}
