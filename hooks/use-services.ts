'use client'

import { useCallback, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Service } from '@/lib/supabase/types'

export function useServices(businessId?: string) {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchServices = useCallback(async () => {
    if (!businessId) {
      setServices([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const { data, error: err } = await supabase
        .from('services')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (err) throw err
      setServices(data || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching services')
      setServices([])
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    fetchServices()
  }, [fetchServices])

  const createService = useCallback(
    async (serviceData: Omit<Service, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error: err } = await supabase
        .from('services')
        .insert([serviceData])
        .select()

      if (err) throw err
      const newService = data?.[0]
      if (newService) {
        setServices((prev) => [newService, ...prev])
      }
      return newService
    },
    []
  )

  const updateService = useCallback(async (serviceId: string, updates: Partial<Service>) => {
    const { data, error: err } = await supabase
      .from('services')
      .update(updates)
      .eq('id', serviceId)
      .select()

    if (err) throw err
    const updated = data?.[0]
    if (updated) {
      setServices((prev) => prev.map((s) => (s.id === serviceId ? updated : s)))
    }
    return updated
  }, [])

  const deleteService = useCallback(async (serviceId: string) => {
    const { error: err } = await supabase.from('services').delete().eq('id', serviceId)

    if (err) throw err
    setServices((prev) => prev.filter((s) => s.id !== serviceId))
  }, [])

  return {
    services,
    loading,
    error,
    fetchServices,
    createService,
    updateService,
    deleteService,
  }
}
