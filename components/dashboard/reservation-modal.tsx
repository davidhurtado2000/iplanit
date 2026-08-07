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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { Calendar, Clock, User, Briefcase, Trash2, MapPin, Repeat, DollarSign, ParkingSquare, ChevronDown, ChevronsUpDown, Check, Eye, UserPlus } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useBusinesses } from '@/hooks/use-businesses'
import { useLanguage } from '@/context/language-context'
import { useDashboardData, type ClientDocumentType } from '@/context/dashboard-data-context'
import { getStatusBadgeVariant, getStatusLabel } from '@/lib/reservation-status'
import { capitalizeFirst, cn } from '@/lib/utils'
import { toTzLocalInput, parseInTimezone, toDateStr } from '@/lib/timezone'
import { generateAvailableSlots, isDayClosed } from '@/lib/availability'
import { sendReservationNotification } from '@/lib/email/notify'
import { isPlanLimitReached, meetsPlan } from '@/lib/plan-limits'
import { formatDuration } from '@/lib/duration'
import { UpgradeModal } from '@/components/upgrade-modal'
import { DurationInput } from '@/components/dashboard/duration-input'

interface Client {
  id: string
  name: string
  email: string | null
  phone: string | null
}

// Same 5 document types as clients/page.tsx's own form - kept identical so
// a client created inline here looks no different from one created there.
const DOCUMENT_TYPES: ClientDocumentType[] = ['dni', 'ruc', 'ein', 'passport', 'other']

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
  /** Only used in create mode, set by the "Create follow-up booking" action
   * on a visit - pre-fills the client (and the service, if the visit had
   * one attached as an interest hint) so closing the follow-up doesn't mean
   * re-entering who they already talked to. */
  prefillClientId?: string
  prefillServiceId?: string | null
  /** Set alongside the two prefill props above - written onto the new
   * reservation on save so a future report can compute visit -> booking
   * conversion (scripts/050-visit-follow-up.sql). */
  followUpOfReservationId?: string | null
  /** Shown as a button on a visit's view - the parent owns modal/prefill
   * state (same reason onSelectReservation etc. are callbacks, not
   * something this component could do by itself), so this just reports
   * "the user wants to convert this visit" and lets the parent decide how
   * to reopen the modal in create mode. */
  onCreateFollowUp?: (source: { clientId: string; serviceId: string | null; reservationId: string }) => void
  /** Only used in create mode, set when opened by clicking directly on an
   * empty slot in the calendar grid (calendar-view.tsx's DayView) instead
   * of the "Nueva reserva" toolbar button. */
  prefillResourceId?: string | null
  /** "YYYY-MM-DDTHH:MM" in business-local time, same shape as
   * formData.start_time - the exact slot that was clicked. Deliberately
   * NOT written to formData.start_time directly (start_time depends on a
   * service/duration being chosen first, see availableSlots below); instead
   * it's auto-selected the moment it turns out to be a real available slot,
   * so a click can never create an invalid/conflicting booking - it just
   * saves re-finding the same slot in the list. */
  prefillStartHint?: string
}

export function ReservationModal({
  isOpen,
  onClose,
  reservation,
  selectedDate,
  mode,
  onSave,
  initialType = 'booking',
  prefillClientId,
  prefillServiceId,
  followUpOfReservationId,
  onCreateFollowUp,
  prefillResourceId,
  prefillStartHint,
}: ReservationModalProps) {
  const supabase = createClient()
  const { profile } = useAuth()
  const { currentBusiness } = useBusinesses()
  const { t, locale } = useLanguage()
  const { clients, services, resources: allResources, serviceResources, serviceDurationOptions, businessHours, reservations, refetchClients } = useDashboardData()
  // Parking is a separate concept from a service's linked resource (see the
  // needsParking switch below) - never offered as a pickable resource here.
  const resources = allResources.filter((r) => r.type !== 'parking')
  const [isLoading, setIsLoading] = useState(false)
  const [cancelConfirmType, setCancelConfirmType] = useState<'single' | 'series' | null>(null)
  const [error, setError] = useState('')
  // Client picker: a searchable combobox instead of a plain <Select> so
  // businesses with a large client list don't have to scroll a giant
  // dropdown to find one person - see clients/page.tsx's own search for the
  // same name/email/document match, kept consistent here.
  const [clientComboOpen, setClientComboOpen] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  // Inline "create client" from within this combobox (colleague-suggested -
  // avoids leaving the reservation form to go create one on the Clients
  // page first). Swaps the Command list for a small form in-place.
  const [isAddingClient, setIsAddingClient] = useState(false)
  const [newClientForm, setNewClientForm] = useState({
    name: '',
    email: '',
    phone: '',
    documentType: 'dni' as ClientDocumentType,
    documentNumber: '',
    notes: '',
  })
  const [isSavingNewClient, setIsSavingNewClient] = useState(false)
  const [newClientError, setNewClientError] = useState('')
  const [showClientLimitModal, setShowClientLimitModal] = useState(false)

  const [formData, setFormData] = useState({
    client_id: '',
    service_id: '',
    resource_id: '',
    start_time: '',
    notes: '',
    type: 'booking' as 'booking' | 'visit',
    duration_option_id: '',
    hours: '' as number | '',
    // Only used for a visit with no service selected (a service already
    // carries its own duration) - was previously a silent, unchangeable
    // 60-minute fallback with no UI at all, see effectiveDurationMinutes.
    visitDurationMinutes: 60 as number | '',
    price: '' as number | '',
    needsParking: false,
  })
  const [parkingError, setParkingError] = useState('')
  const [parkingAvailability, setParkingAvailability] = useState<'checking' | 'available' | 'unavailable' | null>(null)
  // Drives the available-slots grid below (see availableSlots) - kept
  // separate from formData.start_time, which only gets set once an actual
  // slot is picked. Named slotDate (not selectedDate) since that name is
  // already taken by this component's own selectedDate prop.
  const [slotDate, setSlotDate] = useState('')

  const isUSD = currentBusiness?.currency === 'USD'
  const [isEditing, setIsEditing] = useState(mode === 'create')

  // Pro and Premium are both unlimited on reservations - only Free is
  // capped (see scripts/052-three-tier-plans.sql's check_reservation_limit).
  const hasPaidPlan = meetsPlan(profile?.plan, 'pro')
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  // Checked fresh right when a "create" open is requested, rather than on
  // every render - the database trigger (scripts/052-three-tier-plans.sql)
  // is the actual guarantee, this is only the proactive nicety that avoids
  // making someone fill out the whole form just to hit a rejection at the
  // end. Closes the (still-empty) create dialog and shows the Upgrade modal
  // in its place instead of leaving a dead form open. The hasPaidPlan guard
  // here is just a perf shortcut to skip the RPC round-trip when already
  // paid - isPlanLimitReached is tier-aware on its own and would return
  // false anyway.
  useEffect(() => {
    if (!isOpen || mode !== 'create' || hasPaidPlan || !currentBusiness) return
    let cancelled = false
    isPlanLimitReached(currentBusiness.id, 'reservations_this_month').then((reached) => {
      if (!cancelled && reached) {
        onClose()
        setShowUpgradeModal(true)
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode, hasPaidPlan, currentBusiness?.id])

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

  // When the selected service requires a resource, default to the first
  // available one instead of leaving the field empty (a required field
  // with only one real choice - or none picked yet - shouldn't force a
  // manual click just to see what's there). Still resets/reselects if the
  // previously chosen resource isn't valid for the newly selected service.
  useEffect(() => {
    if (allowedResourceIds.length === 0) return
    if (formData.resource_id && allowedResourceIds.includes(formData.resource_id)) return
    const firstAvailable = resources.find((r) => allowedResourceIds.includes(r.id) && r.is_active)
    setFormData((prev) => ({ ...prev, resource_id: firstAvailable?.id || '' }))
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
        // Same inference, for a visit - shows what was actually blocked
        // instead of resetting to 60. A visit's duration never comes from
        // its (optional, informational-only) service, so this applies
        // whether or not one is attached.
        visitDurationMinutes: reservation.type === 'visit' ? actualDuration : 60,
        price: (isUSD ? reservation.price_usd : reservation.price) ?? '',
        needsParking: !!reservation.parking_resource_id,
      })
      setSlotDate(toDateStr(reservation.start_time, tz))
      setIsEditing(mode === 'edit')
    } else {
      setFormData({
        client_id: prefillClientId || '',
        service_id: prefillServiceId || '',
        resource_id: prefillResourceId || '',
        // Left empty on purpose - the slot grid below forces an explicit
        // pick instead of defaulting to a guessed time that might not even
        // be available. (prefillStartHint auto-selects it once it's
        // confirmed available - see the effect below, not here.)
        start_time: '',
        notes: '',
        type: initialType,
        duration_option_id: '',
        hours: '',
        visitDurationMinutes: 60,
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
  }, [reservation, selectedDate, mode, tz, initialType, serviceDurationOptions, isUSD, services, prefillClientId, prefillServiceId, prefillResourceId])

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

  // Client-facing emails triggered from here should match the BUSINESS's
  // audience, not whatever language the staff member happens to have their
  // own dashboard set to (those can differ - e.g. Spanish-speaking staff at
  // a US business serving English-speaking clients). Same country -> language
  // heuristic already used by the reminder cron (app/api/cron/send-reminders),
  // now applied consistently across every email trigger.
  const clientEmailLanguage: 'es' | 'en' = currentBusiness?.country === 'US' ? 'en' : 'es'

  const selectedService = services.find((s) => s.id === formData.service_id)
  const selectedClient = clients.find((c) => c.id === formData.client_id)
  const selectedResource = resources.find((r) => r.id === formData.resource_id)
  const activeClients = clients.filter((c) => c.is_active)
  // Same fields/matching as clients/page.tsx's own search, kept consistent
  // rather than introducing a second fuzzy-match algorithm for the same data.
  const clientSearchResults = (() => {
    const q = clientSearch.trim().toLowerCase()
    if (!q) return activeClients
    return activeClients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.document_number && c.document_number.toLowerCase().includes(q))
    )
  })()
  // Same default-by-country logic as clients/page.tsx's own form.
  const defaultDocumentType: ClientDocumentType = currentBusiness?.country === 'US' ? 'ein' : 'dni'
  const documentTypeLabels: Record<ClientDocumentType, string> = {
    dni: t.clients.documentTypeDni,
    ruc: t.clients.documentTypeRuc,
    ein: t.clients.documentTypeEin,
    passport: t.clients.documentTypePassport,
    other: t.clients.documentTypeOther,
  }

  // Quick-add from the client combobox - same fields as the full form on
  // clients/page.tsx (name, email, phone, document, notes), just reachable
  // without leaving the reservation.
  const handleCreateInlineClient = async () => {
    if (!currentBusiness || !newClientForm.name.trim() || isSavingNewClient) return
    setIsSavingNewClient(true)
    setNewClientError('')
    try {
      const { data, error } = await supabase
        .from('clients')
        .insert({
          name: newClientForm.name.trim(),
          email: newClientForm.email.trim() || null,
          phone: newClientForm.phone.trim() || null,
          document_type: newClientForm.documentNumber.trim() ? newClientForm.documentType : null,
          document_number: newClientForm.documentNumber.trim() || null,
          notes: newClientForm.notes.trim() || null,
          business_id: currentBusiness.id,
        })
        .select('id')
        .single()
      if (error) throw error
      await refetchClients()
      setFormData((prev) => ({ ...prev, client_id: data.id }))
      setIsAddingClient(false)
      setNewClientForm({ name: '', email: '', phone: '', documentType: defaultDocumentType, documentNumber: '', notes: '' })
      setClientComboOpen(false)
      setClientSearch('')
    } catch (err: any) {
      console.error('[iplanit] Error creating client inline:', err)
      // PLN02 = free-plan client limit trigger (scripts/048/052).
      if (err?.code === 'PLN02') {
        setIsAddingClient(false)
        setClientComboOpen(false)
        setShowClientLimitModal(true)
      } else {
        setNewClientError(t.saveError)
      }
    } finally {
      setIsSavingNewClient(false)
    }
  }

  const selectedServiceDurationOptions = serviceDurationOptions.filter((o) => o.service_id === formData.service_id)
  const selectedDurationOption = selectedServiceDurationOptions.find((o) => o.id === formData.duration_option_id)
  // Effective duration: a visit's duration always comes from
  // visitDurationMinutes, never from whatever service is picked - the
  // service field on a visit is purely informational (which service the
  // prospective client is interested in, see selectServiceVisit's copy),
  // not something actually being delivered, so it must never drive how
  // long gets blocked on the calendar. For an actual booking, a preset
  // service without a chosen option, or an hourly service without hours
  // entered yet, has no known duration; a fixed-duration service uses its
  // own duration.
  const effectiveDurationMinutes =
    formData.type === 'visit'
      ? formData.visitDurationMinutes || undefined
      : selectedService?.pricing_mode === 'preset'
        ? selectedDurationOption?.duration_minutes
        : selectedService?.pricing_mode === 'hourly'
          ? (formData.hours || 0) * 60 || undefined
          : selectedService?.duration_minutes

  // Checks parking as soon as a start time + duration are known, instead of
  // only finding out at save time - same reasoning and same RPC as the
  // public booking page's live check. The save handler below still does
  // its own authoritative check (and the DB's exclusion constraint is the
  // real guarantee), this is purely a UX preview.
  useEffect(() => {
    if (!currentBusiness?.offers_parking || !formData.start_time || !effectiveDurationMinutes) {
      setParkingAvailability(null)
      return
    }
    const startDate = parseInTimezone(formData.start_time, tz)
    const endDate = new Date(startDate.getTime() + effectiveDurationMinutes * 60 * 1000)

    // Editing a reservation that already holds a spot, without touching its
    // time, keeps that same spot - same case the save handler special-cases
    // below, otherwise this would wrongly flag it as unavailable against
    // its own current occupancy.
    const timeUnchanged =
      mode === 'edit' &&
      reservation &&
      new Date(reservation.start_time).getTime() === startDate.getTime() &&
      new Date(reservation.end_time).getTime() === endDate.getTime()
    if (timeUnchanged && reservation?.parking_resource_id) {
      setParkingAvailability('available')
      return
    }

    let cancelled = false
    setParkingAvailability('checking')
    supabase
      .rpc('find_available_parking_resource', {
        p_business_id: currentBusiness.id,
        p_start: startDate.toISOString(),
        p_end: endDate.toISOString(),
      })
      .then(({ data }) => {
        if (cancelled) return
        const available = !!data
        setParkingAvailability(available ? 'available' : 'unavailable')
        if (!available) setFormData((prev) => ({ ...prev, needsParking: false }))
      })
    return () => {
      cancelled = true
    }
  }, [
    currentBusiness?.id,
    currentBusiness?.offers_parking,
    formData.start_time,
    effectiveDurationMinutes,
    mode,
    reservation?.id,
    reservation?.start_time,
    reservation?.end_time,
    reservation?.parking_resource_id,
    tz,
  ])

  // Busy ranges for the currently-selected resource, excluding this
  // reservation's own occupancy when editing (so its current slot doesn't
  // show up as unavailable against itself) and cancelled reservations. No
  // resource selected means nothing to conflict with, same as the DB
  // exclusion constraint (scripts 012/035), which only applies when
  // resource_id is set.
  // Each existing reservation's busy window is expanded by its OWN service's
  // buffer minutes (scripts/040-appointment-buffers.sql) - the candidate
  // slot being searched then gets expanded by the SELECTED service's own
  // buffer below, making the check bidirectional (see generateAvailableSlots).
  const busyRanges = formData.resource_id
    ? reservations
        .filter((r) => r.resource_id === formData.resource_id && r.status !== 'cancelled' && r.id !== reservation?.id)
        .map((r) => {
          const svc = services.find((s) => s.id === r.service_id)
          const before = svc?.buffer_before_min || 0
          const after = svc?.buffer_after_min || 0
          return {
            start_time: new Date(new Date(r.start_time).getTime() - before * 60000).toISOString(),
            end_time: new Date(new Date(r.end_time).getTime() + after * 60000).toISOString(),
          }
        })
    : []

  const availableSlots =
    slotDate && effectiveDurationMinutes
      ? generateAvailableSlots(
          slotDate,
          businessHours,
          effectiveDurationMinutes,
          busyRanges,
          tz,
          selectedService?.buffer_before_min || 0,
          selectedService?.buffer_after_min || 0
        )
      : []

  // Distinguishes "the business doesn't open this day" from "open but fully
  // booked" - both show 0 slots, but staff need different next steps for each.
  const dayClosed = !!slotDate && isDayClosed(slotDate, businessHours, tz)

  // Auto-selects the exact slot clicked on the calendar grid (see
  // prefillStartHint above) the moment it actually shows up as available -
  // which depends on a service (and therefore a duration) being chosen
  // first, so this can't just be set once on open. Guarded by
  // formData.start_time being empty so it only ever fires the first time,
  // never overwriting a choice the user makes afterward.
  useEffect(() => {
    if (!prefillStartHint || formData.start_time) return
    const isAvailable = availableSlots.some((slot) => toTzLocalInput(slot.toISOString(), tz) === prefillStartHint)
    if (isAvailable) {
      setFormData((prev) => ({ ...prev, start_time: prefillStartHint }))
    }
  }, [availableSlots, prefillStartHint, formData.start_time, tz])

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

      // status deliberately isn't here - only the 'create' branch below sets
      // it (new reservations always start 'pending'). If it were included
      // here, editing an already-confirmed/completed reservation would
      // silently revert it to 'pending' on every save, even when nothing
      // about its status was touched.
      const reservationData = {
        business_id: currentBusiness.id,
        client_id: formData.client_id,
        service_id: formData.service_id || null,
        resource_id: formData.resource_id || null,
        parking_resource_id: parkingResourceId,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
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
        const { data: created, error } = await supabase
          .from('reservations')
          .insert([{ ...reservationData, status: 'pending', follow_up_of_reservation_id: followUpOfReservationId || null }])
          .select('id')
          .single()

        if (error) throw error
        console.log('[v0] Reservation created successfully')
        if (created && currentBusiness.notify_confirmations && selectedClient?.email) {
          sendReservationNotification('confirmation', created.id, clientEmailLanguage)
        }
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
      } else if (error?.code === 'PLN01') {
        // Backstop for the proactive check above (scripts/052) - only
        // reachable via a real race (e.g. two tabs creating at once).
        onClose()
        setShowUpgradeModal(true)
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
      if (currentBusiness?.notify_cancellations && selectedClient?.email) {
        sendReservationNotification('cancellation', reservation.id, clientEmailLanguage)
      }
      onSave?.()
      onClose()
    } catch (error) {
      console.error('[v0] Error deleting reservation:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // The toast + undo action + chime for this live in dashboard-data-context's
  // realtime subscription, not here - that fires for this exact DB change
  // regardless of who made it, so showing a second toast here would just
  // duplicate it every time (confusing, and two chimes back to back).
  const handleUpdateStatus = async (newStatus: 'pending' | 'confirmed' | 'completed' | 'no_show') => {
    if (!reservation?.id) return

    try {
      setIsLoading(true)
      const { error } = await supabase
        .from('reservations')
        .update({ status: newStatus })
        .eq('id', reservation.id)

      if (error) throw error
      if (newStatus === 'confirmed' && currentBusiness?.notify_confirmations && selectedClient?.email) {
        sendReservationNotification('approved', reservation.id, clientEmailLanguage)
      }

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
  // allResources, not the parking-filtered `resources` above - a parking
  // spot is deliberately excluded from that list (see its own filter).
  const viewParkingSpot = allResources.find((r) => r.id === reservation?.parking_resource_id)

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
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                  <Eye className="h-4 w-4 shrink-0" />
                  <span className="font-medium">{t.reservation.visitBannerText}</span>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{t.reservation.clientLabel}</span>
                <span>{viewClient?.name ?? reservation.client_id}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {reservation.type === 'visit' ? t.reservation.interestedInLabel : t.reservation.serviceLabel}
                </span>
                <span>
                  {viewService
                    ? `${viewService.name} (${formatDuration(
                        Math.round(
                          (new Date(reservation.end_time).getTime() - new Date(reservation.start_time).getTime()) / 60000
                        )
                      )})`
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
                  <span className="font-medium">{t.reservation.parkingAssigned}</span>
                  {viewParkingSpot && <span>{viewParkingSpot.name}</span>}
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

            <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {/* One combined menu instead of a status dropdown PLUS one or
                  two separate solid-red buttons - cancelling is a rarer
                  action than editing, so it shouldn't visually out-weigh
                  the primary Edit button just for living next to it. Status
                  changes and cancellation are still both one click away,
                  just inside the same menu instead of each claiming their
                  own button. Every status transition stays available
                  regardless of the current one (work is unpredictable
                  enough that staff need to correct a status days later, not
                  just right after clicking) - only the option matching the
                  CURRENT status is hidden, since re-applying it is a no-op. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={isLoading} className="gap-2">
                    {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t.reservation.actionsBtn}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {reservation.status !== 'pending' && (
                    <DropdownMenuItem onClick={() => handleUpdateStatus('pending')}>
                      {t.reservation.markPending}
                    </DropdownMenuItem>
                  )}
                  {reservation.status !== 'confirmed' && (
                    <DropdownMenuItem onClick={() => handleUpdateStatus('confirmed')}>
                      {t.reservation.markConfirmed}
                    </DropdownMenuItem>
                  )}
                  {reservation.status !== 'completed' && (
                    <DropdownMenuItem onClick={() => handleUpdateStatus('completed')}>
                      {t.reservation.markCompleted}
                    </DropdownMenuItem>
                  )}
                  {reservation.status !== 'no_show' && new Date(reservation.start_time).getTime() < Date.now() && (
                    <DropdownMenuItem onClick={() => handleUpdateStatus('no_show')}>
                      {t.reservation.markNoShow}
                    </DropdownMenuItem>
                  )}
                  {(reservation.status !== 'cancelled' ||
                    (reservation.series_id && seriesRemaining !== null && seriesRemaining > 0)) && (
                    <DropdownMenuSeparator />
                  )}
                  {reservation.status !== 'cancelled' && (
                    <DropdownMenuItem
                      onClick={() => setCancelConfirmType('single')}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t.reservation.cancelReservation}
                    </DropdownMenuItem>
                  )}
                  {reservation.series_id && seriesRemaining !== null && seriesRemaining > 0 && (
                    <DropdownMenuItem
                      onClick={() => setCancelConfirmType('series')}
                      className="text-destructive focus:text-destructive"
                    >
                      <Repeat className="mr-2 h-4 w-4" />
                      {t.reservation.cancelSeriesRemaining}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex flex-wrap gap-2">
                {reservation.type === 'visit' && onCreateFollowUp && (
                  <Button
                    variant="outline"
                    disabled={isLoading}
                    className="gap-2"
                    onClick={() =>
                      onCreateFollowUp({
                        clientId: reservation.client_id,
                        serviceId: reservation.service_id,
                        reservationId: reservation.id,
                      })
                    }
                  >
                    <Calendar className="h-4 w-4" />
                    {t.reservation.createFollowUpBtn}
                  </Button>
                )}
                <Button onClick={() => setIsEditing(true)} disabled={isLoading} className="w-full sm:w-auto">
                  {t.reservation.editBtn}
                </Button>
              </div>
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
                  onClick={() =>
                    // Clears fields that only make sense for a booking, in
                    // case they were already filled in before switching -
                    // otherwise a stale price/duration-option would ride
                    // along invisibly into a visit that no longer shows
                    // those fields at all.
                    setFormData({
                      ...formData,
                      type: 'visit',
                      price: '',
                      duration_option_id: '',
                      hours: '',
                    })
                  }
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
              <Popover
                open={clientComboOpen}
                onOpenChange={(open) => {
                  setClientComboOpen(open)
                  if (!open) {
                    setClientSearch('')
                    setIsAddingClient(false)
                    setNewClientError('')
                  }
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    id="client"
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={clientComboOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selectedClient ? (
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate font-medium">{selectedClient.name}</span>
                        {selectedClient.email && (
                          <span className="truncate text-xs text-muted-foreground">{selectedClient.email}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t.reservation.selectClient}</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  {isAddingClient ? (
                    <div className="max-h-[70vh] space-y-3 overflow-y-auto p-4">
                      <div className="flex items-center gap-2">
                        <UserPlus className="h-4 w-4 text-primary" />
                        <p className="text-sm font-semibold">{t.reservation.addNewClientTitle}</p>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="new-client-name" className="text-xs">{t.clients.fullName}</Label>
                        <Input
                          id="new-client-name"
                          autoFocus
                          placeholder={t.clients.namePlaceholder}
                          value={newClientForm.name}
                          onChange={(e) => setNewClientForm({ ...newClientForm, name: e.target.value })}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="new-client-email" className="text-xs">{t.clients.emailLabel}</Label>
                          <Input
                            id="new-client-email"
                            type="email"
                            placeholder={t.clients.emailPlaceholder}
                            value={newClientForm.email}
                            onChange={(e) => setNewClientForm({ ...newClientForm, email: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="new-client-phone" className="text-xs">{t.clients.phoneLabel}</Label>
                          <Input
                            id="new-client-phone"
                            type="tel"
                            placeholder={t.clients.phonePlaceholder}
                            value={newClientForm.phone}
                            onChange={(e) => setNewClientForm({ ...newClientForm, phone: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="new-client-doc-type" className="text-xs">{t.clients.documentTypeLabel}</Label>
                          <Select
                            value={newClientForm.documentType}
                            onValueChange={(value: ClientDocumentType) =>
                              setNewClientForm({ ...newClientForm, documentType: value })
                            }
                          >
                            <SelectTrigger id="new-client-doc-type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DOCUMENT_TYPES.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {documentTypeLabels[type]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="new-client-doc-number" className="text-xs">{t.clients.documentNumberLabel}</Label>
                          <Input
                            id="new-client-doc-number"
                            maxLength={30}
                            value={newClientForm.documentNumber}
                            onChange={(e) => setNewClientForm({ ...newClientForm, documentNumber: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="new-client-notes" className="text-xs">{t.clients.notesLabel}</Label>
                        <Textarea
                          id="new-client-notes"
                          rows={2}
                          placeholder={t.clients.notesPlaceholder}
                          value={newClientForm.notes}
                          onChange={(e) => setNewClientForm({ ...newClientForm, notes: e.target.value })}
                        />
                      </div>

                      {newClientError && <p className="text-xs text-destructive">{newClientError}</p>}

                      <div className="flex justify-end gap-2 border-t pt-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setIsAddingClient(false)
                            setNewClientError('')
                          }}
                        >
                          {t.services.cancelBtn}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleCreateInlineClient}
                          disabled={isSavingNewClient || !newClientForm.name.trim()}
                        >
                          {isSavingNewClient && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          {t.reservation.addNewClientSave}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder={t.reservation.searchClientPlaceholder}
                        value={clientSearch}
                        onValueChange={setClientSearch}
                      />
                      <CommandList>
                        {clientSearchResults.length === 0 && (
                          <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                            {activeClients.length === 0 ? t.reservation.noClients : t.reservation.noClientsFound}
                          </p>
                        )}
                        <CommandGroup>
                          {clientSearchResults.map((client) => (
                            <CommandItem
                              key={client.id}
                              value={client.id}
                              onSelect={() => {
                                setFormData({ ...formData, client_id: client.id })
                                setClientComboOpen(false)
                                setClientSearch('')
                              }}
                            >
                              <Check
                                className={cn(
                                  'h-4 w-4 shrink-0',
                                  formData.client_id === client.id ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              <div className="flex min-w-0 flex-col">
                                <span className="truncate font-medium">{client.name}</span>
                                {client.email && (
                                  <span className="truncate text-xs text-muted-foreground">{client.email}</span>
                                )}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                        <CommandGroup>
                          <CommandItem
                            onSelect={() => {
                              setNewClientForm({
                                name: clientSearch.trim(),
                                email: '',
                                phone: '',
                                documentType: defaultDocumentType,
                                documentNumber: '',
                                notes: '',
                              })
                              setNewClientError('')
                              setIsAddingClient(true)
                            }}
                          >
                            <UserPlus className="h-4 w-4 shrink-0" />
                            {t.reservation.addNewClientOption}
                          </CommandItem>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  )}
                </PopoverContent>
              </Popover>
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
                  // A visit's service is just an interest hint (see the
                  // label above) - never suggest a price for it, since the
                  // price field itself doesn't even show for a visit.
                  const suggestedPrice = formData.type !== 'visit' && service && service.pricing_mode === 'fixed'
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
                            `${formatDuration(service.duration_minutes)}${
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

              {formData.type !== 'visit' && selectedService?.pricing_mode === 'preset' && (
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
                          {formatDuration(option.duration_minutes)}
                          {(isUSD ? option.price_usd : option.price)
                            ? ` · ${isUSD ? '$' : 'S/'} ${isUSD ? option.price_usd : option.price}`
                            : ''}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}

              {formData.type !== 'visit' && selectedService?.pricing_mode === 'hourly' && (
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

              {formData.type === 'visit' && (
                <div className="mt-2 space-y-1">
                  <Label htmlFor="visit-duration" className="text-xs font-normal text-muted-foreground">
                    {t.reservation.visitDurationLabel}
                  </Label>
                  <DurationInput
                    id="visit-duration"
                    value={formData.visitDurationMinutes}
                    onChange={(minutes) => setFormData({ ...formData, visitDurationMinutes: minutes, start_time: '' })}
                  />
                  <p className="text-xs text-muted-foreground">{t.reservation.visitDurationHint}</p>
                </div>
              )}

              {effectiveDurationMinutes && (
                <p className="text-xs text-muted-foreground">
                  {t.reservation.durationInfo} {formatDuration(effectiveDurationMinutes)} — {t.reservation.durationEnd}{' '}
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
                retroactively rewrite past revenue (see lib/analytics.ts).
                Hidden for a visit - it never generates revenue regardless
                of what's saved here (excluded by type, not by price), so
                showing an editable price would just look like it charges
                for something the system silently ignores. */}
            {formData.type !== 'visit' && (
              <div className="space-y-2">
                <Label htmlFor="reservation-price">
                  {t.reservation.priceLabel} ({isUSD ? '$' : 'S/.'})
                </Label>
                <Input
                  id="reservation-price"
                  type="number"
                  min={0}
                  step="any"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value !== '' ? parseFloat(e.target.value) : '' })}
                  onBlur={(e) => {
                    if (e.target.value === '') return
                    const rounded = Math.round(parseFloat(e.target.value) * 100) / 100
                    setFormData({ ...formData, price: isNaN(rounded) ? '' : rounded })
                  }}
                />
              </div>
            )}

            {/* Resource - required when the selected service has specific
                resources linked to it (that link is the business explicitly
                saying "this service needs one of these"), optional when it
                doesn't (many service types never need a resource at all). */}
            <div className="space-y-2">
              <Label htmlFor="resource">
                {t.reservation.resourceSelect}{' '}
                {allowedResourceIds.length === 0 && (
                  <span className="text-muted-foreground font-normal">{t.reservation.resourceOptional}</span>
                )}
              </Label>
              <Select
                // "_none" is a real SelectItem only when the resource is
                // optional - when it's required, that item doesn't exist in
                // the list below, so passing "_none" as the value here would
                // make Radix think something is selected (non-empty value)
                // and render a blank trigger instead of the placeholder.
                // Leaving the value undefined in that case lets Radix show
                // the placeholder correctly until the user actually picks one.
                value={formData.resource_id || (allowedResourceIds.length === 0 ? '_none' : undefined)}
                onValueChange={(val) =>
                  // Changing the resource changes which bookings count as
                  // "busy", which can invalidate whatever slot was picked.
                  setFormData({ ...formData, resource_id: val === '_none' ? '' : val, start_time: '' })
                }
              >
                <SelectTrigger id="resource">
                  <SelectValue placeholder={allowedResourceIds.length > 0 ? t.reservation.selectResource : t.reservation.noResource} />
                </SelectTrigger>
                <SelectContent>
                  {allowedResourceIds.length === 0 && (
                    <SelectItem value="_none">{t.reservation.noResource}</SelectItem>
                  )}
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
                  {t.reservation.resourceRequiredHint} ({filteredResources.length})
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
                  {dayClosed ? t.reservation.dayClosed : t.reservation.noSlotsAvailable}
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
                      if (checked && !hasPaidPlan) {
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
              <div className="space-y-1.5">
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
                    disabled={parkingAvailability === 'unavailable'}
                    onCheckedChange={(checked) => setFormData({ ...formData, needsParking: checked })}
                  />
                </div>
                {parkingAvailability === 'checking' && (
                  <p className="pl-1 text-xs text-muted-foreground">{t.reservation.checkingParkingAvailability}</p>
                )}
                {parkingAvailability === 'available' && (
                  <p className="flex items-center gap-1 pl-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3 w-3 shrink-0" />
                    {t.reservation.parkingAvailableAtSlot}
                  </p>
                )}
                {parkingAvailability === 'unavailable' && (
                  <p className="pl-1 text-xs text-amber-600 dark:text-amber-400">
                    {t.reservation.parkingUnavailableAtSlot}
                  </p>
                )}
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
                  (allowedResourceIds.length > 0 && !formData.resource_id) ||
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
      requiredPlan="pro"
    />
    <UpgradeModal
      isOpen={showClientLimitModal}
      onClose={() => setShowClientLimitModal(false)}
      feature={t.upgradeModal.featureUnlimitedRecordsTitle}
      requiredPlan="pro"
    />
    <AlertDialog open={cancelConfirmType !== null} onOpenChange={(open) => !open && setCancelConfirmType(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {cancelConfirmType === 'series' ? t.reservation.cancelSeriesConfirmTitle : t.reservation.cancelConfirmTitle}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {cancelConfirmType === 'series' ? t.reservation.cancelSeriesConfirmDesc : t.reservation.cancelConfirmDesc}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>{t.reservation.keepReservationBtn}</AlertDialogCancel>
          <AlertDialogAction
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={async () => {
              if (cancelConfirmType === 'series') {
                await handleCancelSeries()
              } else {
                await handleDelete()
              }
              setCancelConfirmType(null)
            }}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t.reservation.confirmCancelBtn}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
