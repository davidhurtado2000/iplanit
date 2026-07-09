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
import { Loader2 } from 'lucide-react'
import { Calendar, Clock, User, Briefcase, Trash2, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useBusinesses } from '@/hooks/use-businesses'
import { useLanguage } from '@/context/language-context'
import { useDashboardData } from '@/context/dashboard-data-context'

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
  color: string
}

interface Resource {
  id: string
  name: string
  type: 'room' | 'person' | 'equipment'
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
}

/**
 * Converts a UTC ISO timestamp to "YYYY-MM-DDTHH:MM" expressed in the given
 * IANA timezone. Used to populate datetime-local inputs with the correct
 * business-timezone time regardless of the browser's own timezone.
 */
function toTzLocalInput(utcString: string, timezone: string): string {
  const d = new Date(utcString)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]))
  const h = p.hour === '24' ? '00' : p.hour
  return `${p.year}-${p.month}-${p.day}T${h}:${p.minute}`
}

/**
 * Interprets "YYYY-MM-DDTHH:MM" as a wall-clock time in the given IANA
 * timezone and returns the corresponding UTC Date.
 * This is browser-timezone-independent — it always uses the business timezone.
 */
function parseInTimezone(localString: string, timezone: string): Date {
  // Treat the string as UTC first (no browser-tz conversion happens with 'Z')
  const fakeUtc = new Date(localString + ':00Z')
  // Find out what wall-clock time that UTC moment shows in the target timezone
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(fakeUtc)
  const p = Object.fromEntries(parts.map(x => [x.type, Number(x.value)]))
  const tzAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute)
  // Shift fakeUtc by the difference so the wall-clock time matches localString
  return new Date(fakeUtc.getTime() + (fakeUtc.getTime() - tzAsUtc))
}

export function ReservationModal({
  isOpen,
  onClose,
  reservation,
  selectedDate,
  mode,
  onSave,
}: ReservationModalProps) {
  const supabase = createClient()
  const { profile } = useAuth()
  const { businesses } = useBusinesses()
  const { t, locale } = useLanguage()
  const { clients, services, resources, serviceResources, businessHours } = useDashboardData()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    client_id: '',
    service_id: '',
    resource_id: '',
    start_time: '',
    notes: '',
  })
  const [isEditing, setIsEditing] = useState(mode === 'create')

  const currentBusiness = businesses?.[0]

  // Filter resources based on selected service's allowed sedes
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
      setFormData({
        client_id: reservation.client_id,
        service_id: reservation.service_id,
        resource_id: reservation.resource_id || '',
        start_time: toTzLocalInput(reservation.start_time, tz),
        notes: reservation.notes || '',
      })
      setIsEditing(mode === 'edit')
    } else {
      setFormData({
        client_id: '',
        service_id: '',
        resource_id: '',
        start_time: selectedDate ? `${selectedDate}T09:00` : toTzLocalInput(new Date().toISOString(), tz),
        notes: '',
      })
      setIsEditing(true)
    }
    setError('')
  }, [reservation, selectedDate, mode, tz])

  const selectedService = services.find((s) => s.id === formData.service_id)
  const selectedClient = clients.find((c) => c.id === formData.client_id)
  const selectedResource = resources.find((r) => r.id === formData.resource_id)

  const resourceTypeLabel: Record<Resource['type'], string> = {
    room: t.reservation.roomType,
    person: t.reservation.personType,
    equipment: t.reservation.equipmentType,
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
    const durationMinutes = selectedService?.duration_minutes ?? 0
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!profile || !currentBusiness) {
      console.error('[v0] Error: No hay datos de autenticación o negocio')
      return
    }

    try {
      setIsLoading(true)

      const durationMinutes = selectedService?.duration_minutes ?? 60
      // parseInTimezone ensures the datetime-local value is interpreted as
      // business timezone time, not browser timezone — prevents off-by-one-day bugs.
      const startDate = parseInTimezone(formData.start_time, currentBusiness.timezone || 'America/Lima')
      const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000)

      const reservationData = {
        business_id: currentBusiness.id,
        client_id: formData.client_id,
        service_id: formData.service_id,
        resource_id: formData.resource_id || null,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        status: 'pending',
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
        .update({ status: 'cancelled' })
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
          <DialogDescription>{getDesc()}</DialogDescription>
        </DialogHeader>

        {mode === 'view' && reservation && !isEditing ? (
          <div className="space-y-4">
            <div className="grid gap-3">
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
                    ? `${viewService.name} (${viewService.duration_minutes} min)`
                    : reservation.service_id}
                </span>
              </div>
              {viewResource && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
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
                  {new Date(reservation.start_time).toLocaleDateString(locale, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Badge
                  variant={reservation.status === 'confirmed' ? 'default' : 'secondary'}
                >
                  {reservation.status === 'confirmed' ? t.reservation.confirmed : t.reservation.pending}
                </Badge>
              </div>
              {reservation.notes && (
                <div className="mt-2 rounded-md bg-muted p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t.reservation.notesLabel}</p>
                  <p className="text-sm">{reservation.notes}</p>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isLoading}
                className="gap-2"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {t.reservation.cancelReservation}
              </Button>
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

            {/* Service */}
            <div className="space-y-2">
              <Label htmlFor="service">{t.reservation.serviceSelect}</Label>
              <Select
                value={formData.service_id}
                onValueChange={(val) => setFormData({ ...formData, service_id: val, resource_id: '' })}
              >
                <SelectTrigger id="service">
                  <SelectValue placeholder={t.reservation.selectService} />
                </SelectTrigger>
                <SelectContent>
                  {services.length === 0 ? (
                    <SelectItem value="_empty" disabled>
                      {t.reservation.noServices}
                    </SelectItem>
                  ) : (
                    services.filter((s) => s.is_active).map((service) => (
                      <SelectItem key={service.id} value={service.id}>
                        <span className="font-medium">{service.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {service.duration_minutes} min · S/ {service.price}
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {selectedService && (
                <p className="text-xs text-muted-foreground">
                  {t.reservation.durationInfo} {selectedService.duration_minutes} min — {t.reservation.durationEnd}{' '}
                  {formData.start_time
                    ? new Date(
                        new Date(formData.start_time).getTime() +
                          selectedService.duration_minutes * 60 * 1000
                      ).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </p>
              )}
            </div>

            {/* Resource (optional) */}
            <div className="space-y-2">
              <Label htmlFor="resource">
                {t.reservation.resourceSelect}{' '}
                <span className="text-muted-foreground font-normal">{t.reservation.resourceOptional}</span>
              </Label>
              <Select
                value={formData.resource_id || '_none'}
                onValueChange={(val) => setFormData({ ...formData, resource_id: val === '_none' ? '' : val })}
              >
                <SelectTrigger id="resource">
                  <SelectValue placeholder={t.reservation.noResource} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">{t.reservation.noResource}</SelectItem>
                  {filteredResources.map((resource) => (
                    <SelectItem key={resource.id} value={resource.id}>
                      <span className="font-medium">{resource.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {resourceTypeLabel[resource.type]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {allowedResourceIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Sedes disponibles para este servicio: {filteredResources.length}
                </p>
              )}
            </div>

            {/* Date & Time */}
            <div className="space-y-2">
              <Label htmlFor="datetime">{t.reservation.datetimeInput}</Label>
              <Input
                id="datetime"
                type="datetime-local"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                className={hoursError ? 'border-destructive focus-visible:ring-destructive' : ''}
              />
              {hoursError && (
                <p className="flex items-center gap-1.5 text-xs text-destructive">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  {hoursError}
                </p>
              )}
            </div>

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
                disabled={isLoading || !formData.client_id || !formData.service_id || !!hoursError}
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
  )
}
