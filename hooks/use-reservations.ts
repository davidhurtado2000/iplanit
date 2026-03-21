'use client'

import { useCallback, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Reservation } from '@/lib/supabase/types'

export function useReservations(businessId?: string) {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchReservations = useCallback(async () => {
    if (!businessId) {
      setReservations([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      let query = supabase
        .from('reservations')
        .select('*')
        .eq('business_id', businessId)
        .order('start_time', { ascending: false })

      const { data, error: err } = await query

      if (err) throw err
      setReservations(data || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching reservations')
      setReservations([])
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    fetchReservations()
  }, [fetchReservations])

  const createReservation = useCallback(
    async (reservationData: Omit<Reservation, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error: err } = await supabase
        .from('reservations')
        .insert([reservationData])
        .select()

      if (err) throw err
      const newReservation = data?.[0]
      if (newReservation) {
        setReservations((prev) => [newReservation, ...prev])
      }
      return newReservation
    },
    []
  )

  const updateReservation = useCallback(
    async (reservationId: string, updates: Partial<Reservation>) => {
      const { data, error: err } = await supabase
        .from('reservations')
        .update(updates)
        .eq('id', reservationId)
        .select()

      if (err) throw err
      const updated = data?.[0]
      if (updated) {
        setReservations((prev) => prev.map((r) => (r.id === reservationId ? updated : r)))
      }
      return updated
    },
    []
  )

  const deleteReservation = useCallback(async (reservationId: string) => {
    const { error: err } = await supabase
      .from('reservations')
      .delete()
      .eq('id', reservationId)

    if (err) throw err
    setReservations((prev) => prev.filter((r) => r.id !== reservationId))
  }, [])

  return {
    reservations,
    loading,
    error,
    fetchReservations,
    createReservation,
    updateReservation,
    deleteReservation,
  }
}
