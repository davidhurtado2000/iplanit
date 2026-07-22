'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuthContext } from './auth-context'

interface Business {
  id: string
  owner_id: string
  name: string
  slug: string | null
  timezone: string
  address: string | null
  phone: string | null
  email: string | null
  country: 'PE' | 'US'
  tax_id: string | null
  /** The currency the business actually bills in. Independent of country -
   * a Peru-based business may bill international clients in USD and vice
   * versa - country is only used as the smart default when first set. */
  currency: 'PEN' | 'USD'
  /** Hours before start_time within which a client-initiated cancellation
   * counts as "late" for the reliability history on Clients (see
   * client_reservation_counts). Informational only - see scripts/031 - no
   * payment is ever charged automatically. */
  cancellation_policy_hours: number
  /** Free for every plan (not Premium-gated) - see scripts/035-parking.sql.
   * When true, unlocks the Cochera nav item and the parking checkbox on
   * reservations (internal and public booking page). */
  offers_parking: boolean
  created_at: string
  updated_at: string
  /** 'owner' is computed client-side from owner_id; 'admin'/'sales' come
   * from business_members.role (Premium team members - see
   * scripts/032-granular-roles.sql). Admin operates everything but
   * Configuracion/team, same as the old single "staff" role. Sales is
   * reservations + clients only - see business_member_role() server-side
   * for the source of truth this mirrors. */
  role: 'owner' | 'admin' | 'sales'
}

type BusinessContextType = {
  businesses: Business[]
  /** The business every dashboard page should operate on. A user can now
   * belong to more than one (their own + any they staff on as a Premium
   * team member), so this is no longer just "the first one" - it's
   * whichever the user last picked via switchBusiness(), persisted across
   * reloads, falling back to the first business otherwise. */
  currentBusiness: Business | undefined
  switchBusiness: (businessId: string) => void
  loading: boolean
  error: string | null
  fetchBusinesses: () => Promise<void>
  createBusiness: (data: Omit<Business, 'id' | 'owner_id' | 'created_at' | 'updated_at' | 'role'>) => Promise<Business | undefined>
  updateBusiness: (id: string, updates: Partial<Omit<Business, 'role'>>) => Promise<Business | undefined>
  deleteBusiness: (id: string) => Promise<void>
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined)

// Module-level singleton — safe because createClient() now returns a cached instance
const supabase = createClient()

const CURRENT_BUSINESS_STORAGE_KEY = 'iplanit_current_business_id'

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuthContext()
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [currentBusinessId, setCurrentBusinessId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const switchBusiness = useCallback((businessId: string) => {
    setCurrentBusinessId(businessId)
    localStorage.setItem(CURRENT_BUSINESS_STORAGE_KEY, businessId)
  }, [])

  // Restore the last-picked business once the list loads, falling back to
  // the first one if nothing was stored or the stored id is no longer
  // accessible (e.g. removed as staff since the last visit).
  useEffect(() => {
    if (businesses.length === 0) {
      setCurrentBusinessId(null)
      return
    }
    const stored = localStorage.getItem(CURRENT_BUSINESS_STORAGE_KEY)
    const isStoredValid = stored && businesses.some((b) => b.id === stored)
    setCurrentBusinessId(isStoredValid ? stored : businesses[0].id)
  }, [businesses])

  const currentBusiness = businesses.find((b) => b.id === currentBusinessId) || businesses[0]

  const fetchBusinesses = useCallback(async () => {
    if (!user) {
      setBusinesses([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      // No owner_id filter here on purpose - RLS (is_business_accessible)
      // now returns both businesses the user owns and ones where they're an
      // active Premium staff member, so we let the database decide
      // visibility rather than assuming "owned" is the only case.
      const [{ data, error: err }, { data: memberships }] = await Promise.all([
        supabase.from('businesses').select('*').order('created_at', { ascending: false }),
        // Own membership rows only (RLS) - gives the actual admin/sales role
        // per business instead of assuming every non-owned business means
        // the same access level.
        supabase.from('business_members').select('business_id, role').eq('user_id', user.id),
      ])

      if (err) throw err
      const roleByBusinessId = new Map((memberships || []).map((m) => [m.business_id, m.role]))
      const withRole = (data || []).map((b) => ({
        ...b,
        role: (b.owner_id === user.id ? 'owner' : roleByBusinessId.get(b.id) ?? 'admin') as
          | 'owner'
          | 'admin'
          | 'sales',
      }))
      setBusinesses(withRole)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching businesses')
      setBusinesses([])
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  // Wait for auth to finish before fetching
  useEffect(() => {
    if (authLoading) return
    fetchBusinesses()
  }, [authLoading, fetchBusinesses])

  const createBusiness = useCallback(async (
    businessData: Omit<Business, 'id' | 'owner_id' | 'created_at' | 'updated_at' | 'role'>
  ) => {
    if (!user) throw new Error('User not authenticated')
    const { data, error: err } = await supabase
      .from('businesses')
      .insert([{ ...businessData, owner_id: user.id }])
      .select()
    if (err) throw err
    // Only the owner can insert (RLS), so this is always their own business.
    const newBusiness = data?.[0] ? { ...data[0], role: 'owner' as const } : undefined
    if (newBusiness) setBusinesses((prev) => [newBusiness, ...prev])
    return newBusiness
  }, [user?.id])

  const updateBusiness = useCallback(async (businessId: string, updates: Partial<Omit<Business, 'role'>>) => {
    const { data, error: err } = await supabase
      .from('businesses')
      .update(updates)
      .eq('id', businessId)
      .select()
    if (err) throw err
    // Only the owner can update (RLS), so this is always their own business.
    const updated = data?.[0] ? { ...data[0], role: 'owner' as const } : undefined
    if (updated) setBusinesses((prev) => prev.map((b) => (b.id === businessId ? updated : b)))
    return updated
  }, [])

  const deleteBusiness = useCallback(async (businessId: string) => {
    const { error: err } = await supabase.from('businesses').delete().eq('id', businessId)
    if (err) throw err
    setBusinesses((prev) => prev.filter((b) => b.id !== businessId))
  }, [])

  return (
    <BusinessContext.Provider value={{
      businesses,
      currentBusiness,
      switchBusiness,
      loading,
      error,
      fetchBusinesses,
      createBusiness,
      updateBusiness,
      deleteBusiness,
    }}>
      {children}
    </BusinessContext.Provider>
  )
}

export function useBusinessContext() {
  const ctx = useContext(BusinessContext)
  if (!ctx) throw new Error('useBusinessContext must be used within BusinessProvider')
  return ctx
}
