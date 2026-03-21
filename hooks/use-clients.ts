'use client'

import { useCallback, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Client } from '@/lib/supabase/types'

export function useClients(businessId?: string) {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchClients = useCallback(async () => {
    if (!businessId) {
      setClients([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const { data, error: err } = await supabase
        .from('clients')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('name', { ascending: true })

      if (err) throw err
      setClients(data || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching clients')
      setClients([])
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  const createClient = useCallback(
    async (clientData: Omit<Client, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error: err } = await supabase
        .from('clients')
        .insert([clientData])
        .select()

      if (err) throw err
      const newClient = data?.[0]
      if (newClient) {
        setClients((prev) => [newClient, ...prev])
      }
      return newClient
    },
    []
  )

  const updateClient = useCallback(async (clientId: string, updates: Partial<Client>) => {
    const { data, error: err } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', clientId)
      .select()

    if (err) throw err
    const updated = data?.[0]
    if (updated) {
      setClients((prev) => prev.map((c) => (c.id === clientId ? updated : c)))
    }
    return updated
  }, [])

  const deleteClient = useCallback(async (clientId: string) => {
    const { error: err } = await supabase.from('clients').delete().eq('id', clientId)

    if (err) throw err
    setClients((prev) => prev.filter((c) => c.id !== clientId))
  }, [])

  return {
    clients,
    loading,
    error,
    fetchClients,
    createClient,
    updateClient,
    deleteClient,
  }
}
