'use client'

import { useCallback, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Resource } from '@/lib/supabase/types'

export function useResources(businessId?: string) {
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchResources = useCallback(async () => {
    if (!businessId) {
      setResources([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const { data, error: err } = await supabase
        .from('resources')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('name', { ascending: true })

      if (err) throw err
      setResources(data || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching resources')
      setResources([])
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    fetchResources()
  }, [fetchResources])

  const createResource = useCallback(
    async (resourceData: Omit<Resource, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error: err } = await supabase
        .from('resources')
        .insert([resourceData])
        .select()

      if (err) throw err
      const newResource = data?.[0]
      if (newResource) {
        setResources((prev) => [newResource, ...prev])
      }
      return newResource
    },
    []
  )

  const updateResource = useCallback(
    async (resourceId: string, updates: Partial<Resource>) => {
      const { data, error: err } = await supabase
        .from('resources')
        .update(updates)
        .eq('id', resourceId)
        .select()

      if (err) throw err
      const updated = data?.[0]
      if (updated) {
        setResources((prev) => prev.map((r) => (r.id === resourceId ? updated : r)))
      }
      return updated
    },
    []
  )

  const deleteResource = useCallback(async (resourceId: string) => {
    const { error: err } = await supabase.from('resources').delete().eq('id', resourceId)

    if (err) throw err
    setResources((prev) => prev.filter((r) => r.id !== resourceId))
  }, [])

  return {
    resources,
    loading,
    error,
    fetchResources,
    createResource,
    updateResource,
    deleteResource,
  }
}
