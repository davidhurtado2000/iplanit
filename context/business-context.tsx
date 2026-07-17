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
  created_at: string
  updated_at: string
  /** Computed client-side from owner_id, not a DB column. Staff (Premium
   * team members, see business_members) can operate reservations/clients/
   * services but not Configuracion - see is_business_accessible() in
   * scripts/024-business-members.sql for the server-side equivalent. */
  role: 'owner' | 'staff'
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
      const { data, error: err } = await supabase
        .from('businesses')
        .select('*')
        .order('created_at', { ascending: false })

      if (err) throw err
      const withRole = (data || []).map((b) => ({
        ...b,
        role: (b.owner_id === user.id ? 'owner' : 'staff') as 'owner' | 'staff',
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
