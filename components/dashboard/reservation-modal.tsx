'use client'

import React from "react"

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Loader2 } from 'lucide-react'
import { Calendar, Clock, User, Briefcase, Trash2, MapPin, Repeat, DollarSign, ParkingSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useBusinesses } from '@/hooks/use-businesses'
import { useLanguage } from '@/context/language-context'
import { useDashboardData } from '@/context/dashboard-data-context'
import { getStatusBadgeVariant, getStatusLabel } from '@/lib/reservation-status'
import { capitalizeFirst, cn } from '@/lib/utils'
import { toTzLocalInput, parseInTimezone, toDateStr } from '@/lib/timezone'
import { generateAvailableSlots } from '@/lib/availability'
import { UpgradeModal } from '@/components/upgrade-modal'

interface Client {
  id: string
  name: string
  email: string | null
  phone: string | null
}

interface Service {
  id: string
  name: string
  duration_minutes: number
  price: number
  price_usd: number | null
  color: string
  pricing_mode: 'fixed' | 'preset' | 'hourly'
  hourly_rate: number | null
  hourly_rate_usd: number | null
  min_hours: number | null
  max_hours: number | null
}

interface Resource {
  id: string
  name: string
  type: 'room' | 'person' | 'equipment' | 'virtual' | 'parking'
  color: string
  description: string | null
}

interface BusinessHour {
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: boolean
}

interface ReservationModalProps {
  isOpen: boolean
  onClose: () => void
  reservation?: any | null
  selectedDate?: string
  mode: 'create' | 'edit' | 'view'
  onSave?: () => void
  /** Only used in create mode - which button opened the modal ("Nueva
   * reserva" vs "Nueva visita"). Not editable afterward, so visit/booking
   * counts in Reportes can't drift retroactively. */
  initialType?: 'booking' | 'visit'
}

export function ReservationModal({
  isOpen,
  onClose,
  reservation,
  selectedDate,
  mode,
  onSave,
  initialType = 'booking',
}: ReservationModalProps) {
  const supabase = createClient()
  const { profile } = useAuth()
  const { currentBusiness } = useBusinesses()
  const { t, locale } = useLanguage()
  const { clients, services, resources: allResources, serviceResources, serviceDurationOptions, businessHours, reservations } = useDashboardData()
  // Parking is a separate concept from a service's linked resource (see the
  // needsParking switch below) - never offered as a pickable resource here.
  const resources = allResources.filter((r) => r.type !== 'parking')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    client_id: '',
    service_id: '',
    resource_id: '',
    start_time: '',
    notes: '',
    type: 'booking' as 'booking' | 'visit',
    duration_option_id: '',
    hours: '' as number | '',
    price: '' as number | '',
    needsParking: false,
  })
  const [parkingError, setParkingError] = useState('')
  // Drives the available-slots grid below (see availableSlots) - kept
  // separate from formData.start_time, which only gets set once an actual
  // slot is picked. Named slotDate (not selectedDate) since that name is
  // already taken by this component's own selectedDate prop.
  const [slotDate, setSlotDate] = useState('')

  const isUSD = currentBusiness?.currency === 'USD'
  const [isEditing, setIsEditing] = useState(mode === 'create')

  const isPremium = profile?.plan === 'premium'
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [repeatEnabled, setRepeatEnabled] = useState(false)
  const [repeatDays, setRepeatDays] = useState<number[]>([])
  const [sessionCount, setSessionCount] = useState(4)
  const [seriesResult, setSeriesResult] = useState<{ created: number; total: number; skipped: string[] } | null>(null)
  const [seriesRemaining, setSeriesRemaining] = useState<number | null>(null)

  const toggleRepeatDay = (day: number) => {
    setRepeatDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()))
  }

  // Narrow weekday labels (D, L, M, ...) in the app's own locale, ordered to
  // match JS Date#getDay() (0 = Sunday .. 6 = Saturday). Spanish's narrow
  // form abbreviates Wednesday as "X" (to avoid clashing with Martes's "M"),
  // which reads as a typo rather than a day - spelled out as "Mi" instead.
  const dayLabels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(1970, 0, 4 + i)) // 1970-01-04 was a Sunday
    const label = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(d)
    return label === 'X' ? 'Mi' : label
  })

  // Filter resources based on the selected service's allowed resources
  const allowedResourceIds = serviceResources
    .filter((sr) => sr.service_id === formData.service_id)
    .map((sr) => sr.resource_id)

  const filteredResources = allowedResourceIds.length > 0
    ? resources.filter((r) => allowedResourceIds.includes(r.id) && r.is_active)
    : resources.filter((r) => r.is_active)

  // Reset resource_id when service changes and selected resource is no longer available
  useEffect(() => {
    if (formData.resource_id && allowedResourceIds.length > 0 && !allowedResourceIds.includes(formData.resource_id)) {
      setFormData((prev) => ({ ...prev, resource_id: '' }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.service_id])

  const tz = currentBusiness?.timezone || 'America/Lima'

  useEffect(() => {
    if (reservation) {
      // The specific duration option originally picked isn't stored - infer
      // it from the reservation's actual duration (end - start) so editing
      // shows the right one preselected instead of forcing a re-pick.
      const actualDuration = Math.round(
        (new Date(reservation.end_time).getTime() - new Date(reservation.start_time).getTime()) / 60000
      )
      const matchingOption = serviceDurationOptions.find(
        (o) => o.service_id === reservation.service_id && o.duration_minutes === actualDuration
      )
      const editedService = services.find((s) => s.id === reservation.service_id)
      setFormData({
        client_id: reservation.client_id,
        service_id: reservation.service_id || '',
        resource_id: reservation.resource_id || '',
        start_time: toTzLocalInput(reservation.start_time, tz),
        notes: reservation.notes || '',
        type: reservation.type || 'booking',
        duration_option_id: matchingOption?.id || '',
        // Hours aren't stored directly either - same inference as the
        // duration option above, from the reservation's actual duration.
        hours: editedService?.pricing_mode === 'hourly' ? Math.round(actualDuration / 60) : '',
        price: (isUSD ? reservation.price_usd : reservation.price) ?? '',
        needsParking: !!reservation.parking_resource_id,
      })
      setSlotDate(toDateStr(reservation.start_time, tz))
      setIsEditing(mode === 'edit')
    } else {
      setFormData({
        client_id: '',
        service_id: '',
        resource_id: '',
        // Left empty on purpose - the slot grid below forces an explicit
        // pick instead of defaulting to a guessed time that might not even
        // be available.
        start_time: '',
        notes: '',
        type: initialType,
        duration_option_id: '',
        hours: '',
        price: '',
        needsParking: false,
      })
      setSlotDate(selectedDate || toDateStr(new Date().toISOString(), tz))
      setIsEditing(true)
    }
    setError('')
    setParkingError('')
    setRepeatEnabled(false)
    setRepeatDays([])
    setSessionCount(4)
    setSeriesResult(null)
  }, [reservation, selectedDate, mode, tz, initialType, serviceDurationOptions, isUSD, services])

  // Fetch how many future sessions remain in this reservation's series (if
  // any), so the view can show "quedan N sesiones" and offer to cancel them.
  useEffect(() => {
    if (!reservation?.series_id || !isOpen) {
      setSeriesRemaining(null)
      return
    }
    let cancelled = false
    const loadRemaining = async () => {
      const { count } = await supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq('series_id', reservation.series_id)
        .in('status', ['pending', 'confirmed'])
        .gte('start_time', new Date().toISOString())
      if (!cancelled) setSeriesRemaining(count ?? 0)
    }
    loadRemaining()
    return () => {
      cancelled = true
    }
  }, [reservation?.series_id, isOpen])

  // A 'preset' service with zero options, or an 'hourly' service with no
  // rate configured, can't actually be booked (no way to compute a
  // duration/price) - the Services form now blocks saving into either
  // state, but hide it here too as a fallback for any service that already
  // existed before that guard was added.
  const isServiceBookable = (s: {
    id: string
    pricing_mode: 'fixed' | 'preset' | 'hourly'
    hourly_rate: number | null
    hourly_rate_usd: number | null
  }) => {
    if (s.pricing_mode === 'preset') return serviceDurationOptions.some((o) => o.service_id === s.id)
    if (s.pricing_mode === 'hourly') return !!(s.hourly_rate || s.hourly_rate_usd)
    return true
  }

  const selectedService = services.find((s) => s.id === formData.service_id)
  const selectedClient = clients.find((c) => c.id === formData.client_id)
  const selectedResource = resources.find((r) => r.id === formData.resource_id)
  const selectedServiceDurationOptions = serviceDurationOptions.filter((o) => o.service_id === formData.service_id)
  const selectedDurationOption = selectedServiceDurationOptions.find((o) => o.id === formData.duration_option_id)
  // Effective duration: a preset service without a chosen option, or an
  // hourly service without hours entered yet, has no known duration; a
  // fixed-duration service (or a visit's default) falls back to 60 min,
  // same as handleSubmit/hoursError below.
  const effectiveDurationMinutes =
    selectedService?.pricing_mode === 'preset'
      ? selectedDurationOption?.duration_minutes
      : selectedService?.pricing_mode === 'hourly'
        ? (formData.hours || 0) * 60 || undefined
        : selectedService?.duration_minutes ?? 60

  // Busy ranges for the currently-selected resource, excluding this
  // reservation's own occupancy when editing (so its current slot doesn't
  // show up as unavailable against itself) and cancelled reservations. No
  // resource selected means nothing to conflict with, same as the DB
  // exclusion constraint (scripts 012/035), which only applies when
  // resource_id is set.
  const busyRanges = formData.resource_id
    ? reservations
        .filter((r) => r.resource_id === formData.resource_id && r.status !== 'cancelled' && r.id !== reservation?.id)
        .map((r) => ({ start_time: r.start_time, end_time: r.end_time }))
    : []

  const availableSlots =
    slotDate && effectiveDurationMinutes
      ? generateAvailableSlots(slotDate, businessHours, effectiveDurationMinutes, busyRanges, tz)
      : []

  const resourceTypeLabel: Record<Resource['type'], string> = {
    room: t.reservation.roomType,
    person: t.reservation.personType,
    equipment: t.reservation.equipmentType,
    virtual: t.reservation.virtualType,
    parking: t.nav.parking, // never actually shown - parking resources are filtered out above
  }

  // When user clicks "Edit" from view mode, isEditing becomes true but mode stays 'view'.
  // Use effectiveMode so handleSubmit knows whether to insert or update.
  const effectiveMode = isEditing && mode === 'view' ? 'edit' : mode

  // Business hours validation — use business timezone for day/hour checks
  const hoursError = (() => {
    if (!formData.start_time || businessHours.length === 0) return null
    // formData.start_time is "YYYY-MM-DDTHH:MM" in business timezone already,
    // so we can parse it directly for day-of-week and hour/minute.
    const [datePart, timePart] = formData.start_time.split('T')
    const [hours, minutes] = (timePart || '09:00').split(':').map(Number)
    const jsDate = new Date(datePart + 'T12:00:00Z') // noon UTC avoids DST edge cases for weekday
    const dayOfWeek = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' })
      .format(jsDate)
    // Map English short weekday to JS day number (0=Sun … 6=Sat)
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    const dayNum = dayMap[dayOfWeek] ?? new Date(`${datePart}T12:00:00Z`).getDay()
    const bh = businessHours.find((h) => h.day_of_week === dayNum)
    if (!bh) return null
    if (bh.is_closed) {
      return t.reservation.businessClosed
    }
    const toMinutes = (t: string) => {
      const [h, m] = t.split(':').map(Number)
      return h * 60 + m
    }
    const startMinutes = hours * 60 + minutes
    // Same 60-min fallback as handleSubmit below - a visit (or a flexible
    // service with no duration option picked yet) still takes real time,
    // so treat it like any other unspecified duration instead of skipping
    // the closing-time check entirely.
    const durationMinutes = effectiveDurationMinutes ?? 60
    const endMinutes = startMinutes + durationMinutes
    const openMinutes = toMinutes(bh.open_time)
    const closeMinutes = toMinutes(bh.close_time)
    if (startMinutes < openMinutes) {
      return `${t.reservation.businessOpensAt} ${bh.open_time.slice(0, 5)}`
    }
    if (durationMinutes > 0 && endMinutes > closeMinutes) {
      return `${t.reservation.reservationAfterClose} (${bh.close_time.slice(0, 5)})`
    }
    return null
  })()

  // Creates a reservation_series row and materializes its occurrences as
  // normal reservations (one per matching weekday, starting from the form's
  // date) rather than computing them on the fly — every existing feature
  // (status workflow, overlap constraint, client history, analytics) then
  // keeps working unmodified, since a series occurrence is just a regular
  // reservation tagged with series_id.
  const createSeriesOccurrences = async (firstStart: Date, durationMinutes: number) => {
    const occurrences: Date[] = []
    const cursor = new Date(firstStart)
    while (occurrences.length < sessionCount) {
      if (repeatDays.includes(cursor.getDay())) {
        occurrences.push(new Date(cursor))
      }
      cursor.setDate(cursor.getDate() + 1)
    }

    const { data: series, error: seriesError } = await supabase
      .from('reservation_series')
      .insert({
        business_id: currentBusiness!.id,
        client_id: formData.client_id,
        service_id: formData.service_id,
        resource_id: formData.resource_id || null,
        days_of_week: repeatDays,
        session_count: sessionCount,
        notes: formData.notes || null,
      })
      .select('id')
      .single()

    if (seriesError || !series) throw seriesError || new Error('No se pudo crear la serie')

    let created = 0
    const skipped: string[] = []

    for (const occStart of occurrences) {
      const occEnd = new Date(occStart.getTime() + durationMinutes * 60 * 1000)

      if (formData.resource_id) {
        const { data: conflicts } = await supabase
          .from('reservations')
          .select('id')
          .eq('resource_id', formData.resource_id)
          .neq('status', 'cancelled')
          .lt('start_time', occEnd.toISOString())
          .gt('end_time', occStart.toISOString())

        if (conflicts && conflicts.length > 0) {
          skipped.push(occStart.toLocaleDateString(locale, { day: 'numeric', month: 'short' }))
          continue
        }
      }

      const { error: insertError } = await supabase.from('reservations').insert({
        business_id: currentBusiness!.id,
        client_id: formData.client_id,
        service_id: formData.service_id,
        resource_id: formData.resource_id || null,
        series_id: series.id,
        start_time: occStart.toISOString(),
        end_time: occEnd.toISOString(),
        status: 'pending',
        type: formData.type,
        price: isUSD ? null : formData.price || null,
        price_usd: isUSD ? formData.price || null : null,
        notes: formData.notes || null,
      })

      if (insertError) {
        skipped.push(occStart.toLocaleDateString(locale, { day: 'numeric', month: 'short' }))
      } else {
        created++
      }
    }

    // Nothing could be scheduled — don't leave an empty series behind.
    if (created === 0) {
      await supabase.from('reservation_series').delete().eq('id', series.id)
    }

    return { created, total: occurrences.length, skipped }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!profile || !currentBusiness) {
      console.error('[v0] Error: No hay datos de autenticación o negocio')
      return
    }
    if (effectiveMode === 'create' && repeatEnabled && repeatDays.length === 0) {
      setError(t.reservation.repeatDaysRequired)
      return
    }

    try {
      setIsLoading(true)

      const durationMinutes = effectiveDurationMinutes ?? 60
      // parseInTimezone ensures the datetime-local value is interpreted as
      // business timezone time, not browser timezone — prevents off-by-one-day bugs.
      const startDate = parseInTimezone(formData.start_time, currentBusiness.timezone || 'America/Lima')
      const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000)

      if (effectiveMode === 'create' && repeatEnabled) {
        const result = await createSeriesOccurrences(startDate, durationMinutes)
        if (result.created === 0) {
          setError(t.reservation.seriesAllConflicted)
          return
        }
        onSave?.()
        if (result.skipped.length === 0) {
          onClose()
        } else {
          setSeriesResult(result)
        }
        return
      }

      // Parking is a separate resource from the service's own resource_id -
      // find_available_parking_resource() (script 035) picks any free spot
      // for this exact time range. If none is free, the whole submit is
      // blocked with a clear error rather than silently dropping the
      // request, same reasoning as every other availability check here.
      // Editing a reservation that already holds a spot, without touching
      // its time, keeps that same spot instead of re-querying - the row
      // itself is still "occupying" it until this update commits, so a
      // fresh lookup would wrongly see it as unavailable.
      let parkingResourceId: string | null = null
      if (formData.needsParking) {
        const timeUnchanged =
          effectiveMode === 'edit' &&
          reservation &&
          new Date(reservation.start_time).getTime() === startDate.getTime() &&
          new Date(reservation.end_time).getTime() === endDate.getTime()
        if (timeUnchanged && reservation.parking_resource_id) {
          parkingResourceId = reservation.parking_resource_id
        } else {
          const { data: foundSpot, error: parkingLookupError } = await supabase.rpc(
            'find_available_parking_resource',
            {
              p_business_id: currentBusiness.id,
              p_start: startDate.toISOString(),
              p_end: endDate.toISOString(),
            }
          )
          if (parkingLookupError) throw parkingLookupError
          if (!foundSpot) {
            setError(t.reservation.parkingUnavailable)
            setIsLoading(false)
            return
          }
          parkingResourceId = foundSpot
        }
      }

      const reservationData = {
        business_id: currentBusiness.id,
        client_id: formData.client_id,
        service_id: formData.service_id || null,
        resource_id: formData.resource_id || null,
        parking_resource_id: parkingResourceId,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        status: 'pending' as const,
        type: formData.type,
        price: isUSD ? null : formData.price || null,
        price_usd: isUSD ? formData.price || null : null,
        notes: formData.notes || null,
      }

      // Pre-flight overlap check for a fast, friendly error message. Strict
      // < / > bounds so a reservation ending at 10:00 doesn't block one
      // starting at 10:00. This is only a UX nicety — the actual guarantee
      // against race conditions is the DB exclusion constraint (see
      // scripts/012-reservations-overlap-constraint.sql), since two
      // near-simultaneous submits could both pass this check before either
      // insert commits.
      if (formData.resource_id) {
        let conflictQuery = supabase
          .from('reservations')
          .select('id')
          .eq('resource_id', formData.resource_id)
          .neq('status', 'cancelled')
          .lt('start_time', reservationData.end_time)
          .gt('end_time', reservationData.start_time)

        if (effectiveMode === 'edit' && reservation?.id) {
          conflictQuery = conflictQuery.neq('id', reservation.id)
        }

        const { data: conflicts, error: conflictError } = await conflictQuery
        if (conflictError) throw conflictError
        if (conflicts && conflicts.length > 0) {
          setError(t.reservation.timeConflict)
          setIsLoading(false)
          return
        }
      }

      if (effectiveMode === 'create') {
        const { error } = await supabase
          .from('reservations')
          .insert([reservationData])

        if (error) throw error
        console.log('[v0] Reservation created successfully')
      } else if (effectiveMode === 'edit' && reservation?.id) {
        const { error } = await supabase
          .from('reservations')
          .update(reservationData)
          .eq('id', reservation.id)

        if (error) throw error
        console.log('[v0] Reservation updated successfully')
      }

      onSave?.()
      onClose()
    } catch (error: any) {
      console.error('[v0] Error saving reservation:', error)
      // 23P01 = exclusion_violation, raised by reservations_no_overlap when
      // two near-simultaneous submits both pass the pre-flight check above.
      if (error?.code === '23P01') {
        setError(t.reservation.timeConflict)
      } else {
        setError(error?.message || 'Ocurrió un error al guardar la reserva. Intenta de nuevo.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!reservation?.id) return

    try {
      setIsLoading(true)
      const { error } = await supabase
        .from('reservations')
        .update({ status: 'cancelled', cancelled_by: 'business', cancelled_at: new Date().toISOString() })
        .eq('id', reservation.id)

      if (error) throw error
      console.log('[v0] Reservation cancelled successfully')
      onSave?.()
      onClose()
    } catch (error) {
      console.error('[v0] Error deleting reservation:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateStatus = async (newStatus: 'confirmed' | 'completed' | 'no_show') => {
    if (!reservation?.id) return

    try {
      setIsLoading(true)
      const { error } = await supabase
        .from('reservations')
        .update({ status: newStatus })
        .eq('id', reservation.id)

      if (error) throw error
      onSave?.()
      onClose()
    } catch (error) {
      console.error('[v0] Error updating reservation status:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Cancels every future, still-pending/confirmed occurrence of this
  // reservation's series (including this one) and marks the series itself
  // cancelled so it's no longer treated as active.
  const handleCancelSeries = async () => {
    if (!reservation?.series_id) return

    try {
      setIsLoading(true)
      const nowIso = new Date().toISOString()
      const { error: resError } = await supabase
        .from('reservations')
        .update({ status: 'cancelled', cancelled_by: 'business', cancelled_at: nowIso })
        .eq('series_id', reservation.series_id)
        .in('status', ['pending', 'confirmed'])
        .gte('start_time', nowIso)

      if (resError) throw resError

      const { error: seriesError } = await supabase
        .from('reservation_series')
        .update({ status: 'cancelled' })
        .eq('id', reservation.series_id)

      if (seriesError) throw seriesError

      onSave?.()
      onClose()
    } catch (error) {
      console.error('[v0] Error cancelling series:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getTitle = () => {
    if (mode === 'create') return t.reservation.newTitle
    if (mode === 'view') return t.reservation.viewTitle
    return t.reservation.editTitle
  }

  const getDesc = () => {
    if (mode === 'create') return t.reservation.newDesc
    if (mode === 'view') return t.reservation.viewDesc
    return t.reservation.editDesc
  }

  // Lookup names for view mode
  const viewClient = clients.find((c) => c.id === reservation?.client_id)
  const viewService = services.find((s) => s.id === reservation?.service_id)
  const viewResource = resources.find((r) => r.id === reservation?.resource_id)

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
          <DialogDescription>{getDesc()}</DialogDescription>
        </DialogHeader>

        {seriesResult ? (
          <div className="space-y-4">
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <p className="font-medium">
                {t.reservation.seriesPartialTitle
                  .replace('{created}', String(seriesResult.created))
                  .replace('{total}', String(seriesResult.total))}
              </p>
              <p className="mt-1 text-xs">{t.reservation.seriesPartialDesc}</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs">
                {seriesResult.skipped.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>{t.reservation.understood}</Button>
            </DialogFooter>
          </div>
        ) : mode === 'view' && reservation && !isEditing ? (
          <div className="space-y-4">
            <div className="grid gap-3">
              {reservation.type === 'visit' && (
                <Badge variant="outline" className="w-fit">{t.reservation.typeVisit}</Badge>
              )}
              <div className="flex items-center gap-3 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{t.reservation.clientLabel}</span>
                <span>{viewClient?.name ?? reservation.client_id}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{t.reservation.serviceLabel}</span>
                <span>
                  {viewService
                    ? `${viewService.name} (${Math.round(
                        (new Date(reservation.end_time).getTime() - new Date(reservation.start_time).getTime()) / 60000
                      )} min)`
                    : t.reservation.noServiceVisit}
                </span>
              </div>
              {(reservation.price || reservation.price_usd) && (
                <div className="flex items-center gap-3 text-sm">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{t.reservation.priceLabel}</span>
                  <span>{isUSD ? '$' : 'S/'} {reservation.price_usd || reservation.price}</span>
                </div>
              )}
              {reservation.parking_resource_id && (
                <div className="flex items-center gap-3 text-sm">
                  <ParkingSquare className="h-4 w-4 text-muted-foreground" />
                  <span>{t.reservation.parkingAssigned}</span>
                </div>
              )}
              {viewResource && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="h-4 w-4" style={{ color: viewResource.color || undefined }} />
                  <span className="font-medium">{t.reservation.resourceLabel}</span>
                  <span>
                    {viewResource.name}
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({resourceTypeLabel[viewResource.type]})
                    </span>
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{t.reservation.datetimeLabel}</span>
                <span>
                  {capitalizeFirst(
                    new Date(reservation.start_time).toLocaleDateString(locale, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  )}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Badge variant={getStatusBadgeVariant(reservation.status)}>
                  {getStatusLabel(reservation.status, t.reservation)}
                </Badge>
              </div>
              {reservation.series_id && (
                <div className="flex items-center gap-3 rounded-md bg-muted/50 p-3 text-sm">
                  <Repeat className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="font-medium">{t.reservation.partOfSeries}</p>
                    {seriesRemaining !== null && (
                      <p className="text-xs text-muted-foreground">
                        {t.reservation.seriesRemaining.replace('{count}', String(seriesRemaining))}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {reservation.notes && (
                <div className="mt-2 rounded-md bg-muted p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t.reservation.notesLabel}</p>
                  <p className="text-sm">{reservation.notes}</p>
                </div>
              )}
            </div>

            <DialogFooter className="flex-wrap gap-2">
              {(reservation.status === 'pending' || reservation.status === 'confirmed') && (
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isLoading}
                  className="gap-2"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {t.reservation.cancelReservation}
                </Button>
              )}
              {reservation.status === 'pending' && (
                <Button variant="outline" onClick={() => handleUpdateStatus('confirmed')} disabled={isLoading}>
                  {t.reservation.markConfirmed}
                </Button>
              )}
              {reservation.status === 'confirmed' && (
                <Button variant="outline" onClick={() => handleUpdateStatus('completed')} disabled={isLoading}>
                  {t.reservation.markCompleted}
                </Button>
              )}
              {(reservation.status === 'pending' || reservation.status === 'confirmed') &&
                new Date(reservation.start_time).getTime() < Date.now() && (
                <Button variant="outline" onClick={() => handleUpdateStatus('no_show')} disabled={isLoading}>
                  {t.reservation.markNoShow}
                </Button>
              )}
              {reservation.series_id && seriesRemaining !== null && seriesRemaining > 0 && (
                <Button variant="destructive" onClick={handleCancelSeries} disabled={isLoading} className="gap-2">
                  <Repeat className="h-4 w-4" />
                  {t.reservation.cancelSeriesRemaining}
                </Button>
              )}
              <Button onClick={() => setIsEditing(true)} disabled={isLoading}>{t.reservation.editBtn}</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Type - only choosable at creation, so visit/booking counts in
                Reportes can't drift after the fact (see initialType above). */}
            {mode === 'create' && (
              <div className="flex gap-2 rounded-lg border p-1">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: 'booking' })}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    formData.type === 'booking'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {t.reservation.typeBooking}
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: 'visit' })}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    formData.type === 'visit'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {t.reservation.typeVisit}
                </button>
              </div>
            )}

            {/* Client */}
            <div className="space-y-2">
              <Label htmlFor="client">{t.reservation.clientSelect}</Label>
              <Select
                value={formData.client_id}
                onValueChange={(val) => setFormData({ ...formData, client_id: val })}
              >
                <SelectTrigger id="client">
                  <SelectValue placeholder={t.reservation.selectClient} />
                </SelectTrigger>
                <SelectContent>
                  {clients.length === 0 ? (
                    <SelectItem value="_empty" disabled>
                      {t.reservation.noClients}
                    </SelectItem>
                  ) : (
                    clients.filter((c) => c.is_active).map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        <span className="font-medium">{client.name}</span>
                        {client.email && (
                          <span className="ml-2 text-xs text-muted-foreground">{client.email}</span>
                        )}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Service - required for a booking, optional for a visit (a
                prospective client may just want to see the place). */}
            <div className="space-y-2">
              <Label htmlFor="service">
                {t.reservation.serviceSelect}
                {formData.type === 'visit' && (
                  <span className="ml-1 font-normal text-muted-foreground">{t.reservation.resourceOptional}</span>
                )}
              </Label>
              <Select
                value={formData.service_id}
                onValueChange={(val) => {
                  const service = services.find((s) => s.id === val)
                  const suggestedPrice = service && service.pricing_mode === 'fixed'
                    ? (isUSD ? service.price_usd : service.price) ?? ''
                    : ''
                  setFormData({
                    ...formData,
                    service_id: val,
                    resource_id: '',
                    duration_option_id: '',
                    hours: '',
                    price: suggestedPrice,
                    // Changing the service changes its duration, which can
                    // invalidate whatever slot was already picked.
                    start_time: '',
                  })
                }}
              >
                <SelectTrigger id="service">
                  <SelectValue
                    placeholder={formData.type === 'visit' ? t.reservation.selectServiceVisit : t.reservation.selectService}
                  />
                </SelectTrigger>
                <SelectContent>
                  {services.length === 0 ? (
                    <SelectItem value="_empty" disabled>
                      {t.reservation.noServices}
                    </SelectItem>
                  ) : (
                    services.filter((s) => s.is_active && isServiceBookable(s)).map((service) => (
                      <SelectItem key={service.id} value={service.id}>
                        <span className="font-medium">{service.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {service.pricing_mode === 'preset' && t.reservation.flexibleDurationTag}
                          {service.pricing_mode === 'hourly' &&
                            `${t.reservation.hourlyTag}${
                              (isUSD ? service.hourly_rate_usd : service.hourly_rate)
                                ? ` · ${isUSD ? '$' : 'S/'} ${isUSD ? service.hourly_rate_usd : service.hourly_rate}${t.services.perHour}`
                                : ''
                            }`}
                          {service.pricing_mode === 'fixed' &&
                            `${service.duration_minutes} min${
                              (isUSD ? service.price_usd : service.price)
                                ? ` · ${isUSD ? '$' : 'S/'} ${isUSD ? service.price_usd : service.price}`
                                : ''
                            }`}
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              {selectedService?.pricing_mode === 'preset' && (
                <Select
                  value={formData.duration_option_id}
                  onValueChange={(val) => {
                    const option = selectedServiceDurationOptions.find((o) => o.id === val)
                    setFormData({
                      ...formData,
                      duration_option_id: val,
                      price: option ? ((isUSD ? option.price_usd : option.price) ?? '') : '',
                      start_time: '',
                    })
                  }}
                >
                  <SelectTrigger id="duration-option" className="mt-2">
                    <SelectValue placeholder={t.reservation.selectDuration} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedServiceDurationOptions.length === 0 ? (
                      <SelectItem value="_empty" disabled>
                        {t.reservation.noDurationOptions}
                      </SelectItem>
                    ) : (
                      selectedServiceDurationOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.duration_minutes} min
                          {(isUSD ? option.price_usd : option.price)
                            ? ` · ${isUSD ? '$' : 'S/'} ${isUSD ? option.price_usd : option.price}`
                            : ''}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}

              {selectedService?.pricing_mode === 'hourly' && (
                <div className="mt-2 space-y-1">
                  <Input
                    type="number"
                    min={selectedService.min_hours ?? 1}
                    max={selectedService.max_hours ?? undefined}
                    step={1}
                    placeholder={t.reservation.hoursLabel}
                    value={formData.hours}
                    onChange={(e) => {
                      const hours = e.target.value !== '' ? parseInt(e.target.value) : ''
                      const rate = isUSD ? selectedService.hourly_rate_usd : selectedService.hourly_rate
                      setFormData({
                        ...formData,
                        hours,
                        price: hours !== '' && rate ? hours * rate : '',
                        start_time: '',
                      })
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t.reservation.hoursRangeHint
                      .replace('{min}', String(selectedService.min_hours ?? 1))
                      .replace('{max}', String(selectedService.max_hours ?? '—'))}
                  </p>
                </div>
              )}

              {selectedService && effectiveDurationMinutes && (
                <p className="text-xs text-muted-foreground">
                  {t.reservation.durationInfo} {effectiveDurationMinutes} min — {t.reservation.durationEnd}{' '}
                  {formData.start_time
                    ? new Date(
                        new Date(formData.start_time).getTime() +
                          effectiveDurationMinutes * 60 * 1000
                      ).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </p>
              )}
            </div>

            {/* Price - pre-filled from the service/duration option but
                editable for one-off quotes ("cotizaciones"); snapshotted
                onto the reservation so later service price changes don't
                retroactively rewrite past revenue (see lib/analytics.ts). */}
            <div className="space-y-2">
              <Label htmlFor="reservation-price">
                {t.reservation.priceLabel} ({isUSD ? '$' : 'S/.'})
              </Label>
              <Input
                id="reservation-price"
                type="number"
                min={0}
                step={0.01}
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value !== '' ? parseFloat(e.target.value) : '' })}
              />
            </div>

            {/* Resource (optional) */}
            <div className="space-y-2">
              <Label htmlFor="resource">
                {t.reservation.resourceSelect}{' '}
                <span className="text-muted-foreground font-normal">{t.reservation.resourceOptional}</span>
              </Label>
              <Select
                value={formData.resource_id || '_none'}
                onValueChange={(val) =>
                  // Changing the resource changes which bookings count as
                  // "busy", which can invalidate whatever slot was picked.
                  setFormData({ ...formData, resource_id: val === '_none' ? '' : val, start_time: '' })
                }
              >
                <SelectTrigger id="resource">
                  <SelectValue placeholder={t.reservation.noResource} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">{t.reservation.noResource}</SelectItem>
                  {filteredResources.map((resource) => (
                    <SelectItem key={resource.id} value={resource.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: resource.color || '#3B82F6' }}
                        />
                        <span className="font-medium">{resource.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {resourceTypeLabel[resource.type]}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {allowedResourceIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Recursos disponibles para este servicio: {filteredResources.length}
                </p>
              )}
            </div>

            {/* Date & Time - the slot grid below is generated from real
                business hours + existing bookings (see lib/availability.ts,
                shared with the public booking page), instead of a plain
                datetime input that only told you about a conflict after
                trying to save. */}
            <div className="space-y-2">
              <Label htmlFor="reservation-date">{t.reservation.datetimeInput}</Label>
              <Input
                id="reservation-date"
                type="date"
                value={slotDate}
                onChange={(e) => {
                  setSlotDate(e.target.value)
                  setFormData({ ...formData, start_time: '' })
                }}
              />
              {!effectiveDurationMinutes ? (
                <p className="text-xs text-muted-foreground">{t.reservation.pickDurationFirst}</p>
              ) : availableSlots.length === 0 ? (
                <p className="flex items-center gap-1.5 text-xs text-destructive">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  {t.reservation.noSlotsAvailable}
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {availableSlots.map((slot) => {
                    const value = toTzLocalInput(slot.toISOString(), tz)
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFormData({ ...formData, start_time: value })}
                        className={cn(
                          'rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                          formData.start_time === value
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'hover:bg-muted'
                        )}
                      >
                        {slot.toLocaleTimeString(locale, { timeZone: tz, hour: '2-digit', minute: '2-digit' })}
                      </button>
                    )
                  })}
                </div>
              )}
              {formData.start_time &&
                !availableSlots.some((s) => toTzLocalInput(s.toISOString(), tz) === formData.start_time) && (
                  <p className="text-xs text-muted-foreground">
                    {t.reservation.currentTimeLabel}: {formData.start_time.split('T')[1]}
                  </p>
                )}
              {hoursError && (
                <p className="flex items-center gap-1.5 text-xs text-destructive">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  {hoursError}
                </p>
              )}
            </div>

            {/* Repeat (create mode only, Premium, bookings only - a
                recurring showroom visit isn't a real use case) */}
            {mode === 'create' && formData.type === 'booking' && (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Repeat className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="repeat" className="cursor-pointer">
                      {t.reservation.repeatLabel}
                    </Label>
                  </div>
                  <Switch
                    id="repeat"
                    checked={repeatEnabled}
                    onCheckedChange={(checked) => {
                      if (checked && !isPremium) {
                        setShowUpgradeModal(true)
                        return
                      }
                      setRepeatEnabled(checked)
                    }}
                  />
                </div>
                {repeatEnabled && (
                  <div className="space-y-3 pt-1">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{t.reservation.repeatDaysLabel}</Label>
                      <div className="flex flex-wrap gap-2">
                        {dayLabels.map((label, day) => (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleRepeatDay(day)}
                            className={cn(
                              'h-8 w-8 rounded-full border text-xs font-medium transition-colors',
                              repeatDays.includes(day)
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-input text-muted-foreground hover:bg-muted'
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sessionCount" className="text-xs text-muted-foreground">
                        {t.reservation.sessionCountLabel}
                      </Label>
                      <Input
                        id="sessionCount"
                        type="number"
                        min={2}
                        max={52}
                        value={sessionCount}
                        onChange={(e) =>
                          setSessionCount(Math.max(2, Math.min(52, Number(e.target.value) || 2)))
                        }
                        className="w-24"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t.reservation.repeatHint.replace('{count}', String(sessionCount))}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Parking (only shown if the business offers it) */}
            {currentBusiness?.offers_parking && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <ParkingSquare className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="needs-parking" className="cursor-pointer">
                    {t.reservation.needsParkingLabel}
                  </Label>
                </div>
                <Switch
                  id="needs-parking"
                  checked={formData.needsParking}
                  onCheckedChange={(checked) => setFormData({ ...formData, needsParking: checked })}
                />
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">{t.reservation.notesOptional}</Label>
              <Textarea
                id="notes"
                placeholder={t.reservation.notesPlaceholder}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                {t.reservation.cancelBtn}
              </Button>
              <Button
                type="submit"
                disabled={
                  isLoading ||
                  !formData.client_id ||
                  !formData.start_time ||
                  (formData.type === 'booking' && !formData.service_id) ||
                  (selectedService?.pricing_mode === 'preset' && !formData.duration_option_id) ||
                  (selectedService?.pricing_mode === 'hourly' &&
                    (formData.hours === '' ||
                      formData.hours < (selectedService.min_hours ?? 1) ||
                      formData.hours > (selectedService.max_hours ?? Infinity))) ||
                  !!hoursError ||
                  (repeatEnabled && repeatDays.length === 0)
                }
                className="gap-2"
              >
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === 'create' ? t.reservation.createBtn : t.reservation.saveBtn}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
    <UpgradeModal
      isOpen={showUpgradeModal}
      onClose={() => setShowUpgradeModal(false)}
      feature={t.reservation.repeatLabel}
    />
    </>
  )
}
