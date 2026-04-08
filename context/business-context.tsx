'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuthContext } from './auth-context'

interface Business {
  id: string
  owner_id: string
  name: string
  slug: string
  timezone: string
  created_at: string
  updated_at: string
}

type BusinessContextType = {
  businesses: Business[]
  loading: boolean
  error: string | null
  fetchBusinesses: () => Promise<void>
  createBusiness: (data: Omit<Business, 'id' | 'owner_id' | 'created_at' | 'updated_at'>) => Promise<Business | undefined>
  updateBusiness: (id: string, updates: Partial<Business>) => Promise<Business | undefined>
  deleteBusiness: (id: string) => Promise<void>
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined)

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuthContext()
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const fetchBusinesses = useCallback(async () => {
    if (!user) {
      setBusinesses([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const { data, error: err } = await supabase
        .from('businesses')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })

      if (err) throw err
      setBusinesses(data || [])
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
    businessData: Omit<Business, 'id' | 'owner_id' | 'created_at' | 'updated_at'>
  ) => {
    if (!user) throw new Error('User not authenticated')
    const { data, error: err } = await supabase
      .from('businesses')
      .insert([{ ...businessData, owner_id: user.id }])
      .select()
    if (err) throw err
    const newBusiness = data?.[0]
    if (newBusiness) setBusinesses((prev) => [newBusiness, ...prev])
    return newBusiness
  }, [user?.id])

  const updateBusiness = useCallback(async (businessId: string, updates: Partial<Business>) => {
    const { data, error: err } = await supabase
      .from('businesses')
      .update(updates)
      .eq('id', businessId)
      .select()
    if (err) throw err
    const updated = data?.[0]
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
