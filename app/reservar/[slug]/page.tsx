'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { SmartAvatarImage } from '@/components/ui/smart-avatar-image'
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Phone,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Building2,
  Copy,
  Check,
  X,
  ParkingSquare,
  Users,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Confetti } from '@/components/confetti'
import { LanguageToggle } from '@/components/language-toggle'
import { useLanguage } from '@/context/language-context'
import { capitalizeFirst, cn } from '@/lib/utils'
import { parseInTimezone } from '@/lib/timezone'
import { generateAvailableSlots, intersectSlots, isDayClosed } from '@/lib/availability'
import { sendReservationNotification } from '@/lib/email/notify'
import { syncReservationToKommo } from '@/lib/kommo/sync'
import { TurnstileWidget, type TurnstileWidgetHandle } from '@/components/turnstile-widget'
import { LogoLoader } from '@/components/logo-loader'
import { bookingBrandStyle } from '@/lib/booking-fonts'
import { BookingMonthCalendar } from '@/components/booking-month-calendar'

interface PublicBusiness {
  id: string
  name: string
  description: string | null
  address: string | null
  phone: string | null
  timezone: string
  logo_url: string | null
  offers_parking: boolean
  notify_confirmations: boolean
  country: 'PE' | 'US'
  /** Undefined until scripts/102 runs - treated as off. */
  client_chooses_worker?: boolean
  /** scripts/103 - null/undefined = default booking look. */
  booking_font?: string | null
  booking_accent_color?: string | null
}

interface PublicWorker {
  id: string
  name: string
  photo_url: string | null
  /** Empty = does every service (dashboard convention). */
  service_ids: string[]
  /** Empty = follows business hours. */
  hours: PublicBusinessHour[]
}

interface PublicResource {
  id: string
  name: string
  color: string
}

interface PublicDurationOption {
  id: string
  duration_minutes: number
  price: number | null
  price_usd: number | null
}

interface PublicService {
  id: string
  name: string
  description: string | null
  duration_minutes: number
  price: number
  price_usd: number | null
  color: string
  image_url: string | null
  pricing_mode: 'fixed' | 'preset' | 'hourly'
  hourly_rate: number | null
  hourly_rate_usd: number | null
  min_hours: number | null
  max_hours: number | null
  buffer_before_min: number
  buffer_after_min: number
  client_chooses_resource: boolean
  duration_options: PublicDurationOption[]
  resources: PublicResource[]
}

interface PublicBusinessHour {
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: boolean
  /** Worker rows only (scripts/108): alternating-week group, null = every week. */
  week_rotation?: number | null
}

type Step = 'service' | 'duration' | 'hours' | 'resource' | 'worker' | 'datetime' | 'contact' | 'success'

function todayInTz(tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function addMonths(dateStr: string, months: number) {
  const d = new Date(dateStr.slice(0, 8) + '01T12:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

// A service with 2+ linked resources only asks the client to pick one when
// client_chooses_resource is on (scripts/096) - off means the choice is
// pure internal logistics to that business (e.g. interchangeable chairs),
// so the client only ever sees date/time and the server auto-assigns
// whichever linked resource is actually free.
function needsResourceStep(svc: PublicService) {
  return svc.resources.length > 1 && svc.client_chooses_resource
}

// The steps after "service" genuinely vary per service (duration/hours/
// resource are each conditional on how that service is configured) - this
// mirrors the exact same branching handleSelectService/goToResourceOrDatetime
// already use, just to know what to show in the progress indicator.
function getStepSequence(svc: PublicService, showWorkerStep: boolean): Step[] {
  const steps: Step[] = []
  if (svc.pricing_mode === 'preset') steps.push('duration')
  if (svc.pricing_mode === 'hourly') steps.push('hours')
  if (needsResourceStep(svc)) steps.push('resource')
  if (showWorkerStep) steps.push('worker')
  steps.push('datetime', 'contact')
  return steps
}

function workerInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export default function PublicBookingPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug
  // ?embed=1 means this is loaded inside an <iframe> on the business's own
  // website (Settings' "Insertar en tu web" snippet) rather than visited
  // directly - min-h-screen there would force the iframe to the full
  // viewport height instead of sizing to the actual content.
  const searchParams = useSearchParams()
  const isEmbed = searchParams.get('embed') === '1'
  const supabase = createClient()
  const { language, t, locale, applyPageLanguage, hasSavedLanguage } = useLanguage()
  const tr = t.publicBooking

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [business, setBusiness] = useState<PublicBusiness | null>(null)
  const [services, setServices] = useState<PublicService[]>([])
  const [businessHours, setBusinessHours] = useState<PublicBusinessHour[]>([])

  const [step, setStep] = useState<Step>('service')
  const [selectedService, setSelectedService] = useState<PublicService | null>(null)
  const [selectedDurationOptionId, setSelectedDurationOptionId] = useState<string | null>(null)
  const [selectedHours, setSelectedHours] = useState<number | ''>('')
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null)
  const [workers, setWorkers] = useState<PublicWorker[]>([])
  // null = "Sin preferencia" (the server auto-assigns a free worker).
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null)

  // Workers who do this service. Empty when the business hasn't turned on
  // client_chooses_worker (get_public_workers returns nothing then), which
  // keeps the whole flow exactly as it was before scripts/102.
  const eligibleWorkersFor = (svc: PublicService) =>
    workers.filter((w) => w.service_ids.length === 0 || w.service_ids.includes(svc.id))
  // With a single eligible worker there's nothing to choose - they're
  // preselected silently and the step is skipped.
  const needsWorkerStep = (svc: PublicService) => eligibleWorkersFor(svc).length > 1
  const selectedWorker = workers.find((w) => w.id === selectedWorkerId) ?? null
  // "Sin preferencia": the server picks the barber, so who they got is only
  // known after booking - read back for the confirmation screen.
  const [assignedWorker, setAssignedWorker] = useState<{ name: string; photo_url: string | null } | null>(null)
  const confirmedWorker = selectedWorker ?? assignedWorker

  const selectedDurationOption = selectedService?.duration_options.find((o) => o.id === selectedDurationOptionId) ?? null
  const effectiveDurationMinutes =
    selectedService?.pricing_mode === 'preset'
      ? selectedDurationOption?.duration_minutes ?? 0
      : selectedService?.pricing_mode === 'hourly'
        ? (selectedHours || 0) * 60
        : selectedService?.duration_minutes ?? 0

  // Empty until the client picks a day on the month calendar - no
  // assuming "as soon as possible" for them.
  const [selectedDate, setSelectedDate] = useState('')
  // 'YYYY-MM-01' of the month the calendar shows. Availability is computed
  // for the whole month at once so every day can show whether it has room.
  const [visibleMonth, setVisibleMonth] = useState('')
  const [slotsByDay, setSlotsByDay] = useState<Record<string, Date[]>>({})
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<Date | null>(null)
  const slots = (selectedDate && slotsByDay[selectedDate]) || []

  const [contactForm, setContactForm] = useState({ name: '', email: '', phone: '', documentNumber: '', notes: '' })
  // "Option A" from the client-accounts conversation - no login, just
  // recognize a returning client earlier (while they're still typing)
  // instead of only silently matching them server-side after they submit.
  const [clientMatch, setClientMatch] = useState<{ name: string; email: string | null; phone: string | null } | null>(
    null
  )
  const [matchDismissed, setMatchDismissed] = useState(false)
  const [needsParking, setNeedsParking] = useState(false)
  const [parkingAvailability, setParkingAvailability] = useState<'checking' | 'available' | 'unavailable' | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstileRef = useRef<TurnstileWidgetHandle>(null)

  // Turnstile tokens are single-use - a failed submit (any error, not just
  // a bot-verification one) still spends the token already sent, even
  // though the widget keeps showing its checkmark from the first verify.
  // Without this, a corrected retry silently resends the stale token and
  // the server rejects it as bot_verification_failed - showing "couldn't
  // verify you're human" for what was really e.g. a missing name field.
  const resetTurnstile = () => {
    turnstileRef.current?.reset()
    setTurnstileToken(null)
  }
  const [manageReservationId, setManageReservationId] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const manageLinkInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!slug) return
    const load = async () => {
      setLoading(true)
      const { data: businessData } = await supabase.rpc('get_public_business', { p_slug: slug })
      const biz = businessData as PublicBusiness | null
      if (!biz) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setBusiness(biz)
      // Open in the business's own language (Peru -> Spanish, US ->
      // English) instead of the app-wide English default. ?lang= in the
      // embed snippet forces one. On the normal link a visitor's own past
      // choice still wins; inside an embed there's no such choice to
      // honor (the iframe's storage is separate from the host site's).
      const forced = searchParams.get('lang')
      const businessLanguage = forced === 'es' || forced === 'en' ? forced : biz.country === 'US' ? 'en' : 'es'
      if (forced || isEmbed || !hasSavedLanguage()) applyPageLanguage(businessLanguage)

      const [{ data: servicesData }, { data: hoursData }, { data: workersData }] = await Promise.all([
        supabase.rpc('get_public_services', { p_business_id: biz.id }),
        supabase.rpc('get_public_business_hours', { p_business_id: biz.id }),
        biz.client_chooses_worker
          ? supabase.rpc('get_public_workers', { p_business_id: biz.id })
          : Promise.resolve({ data: [] }),
      ])
      setWorkers((workersData as PublicWorker[] | null) || [])
      // A 'preset' service with no options, or an 'hourly' service with no
      // rate configured, can't actually be booked (no way to resolve a
      // duration/price) - never show either to a real client here, even
      // though the Services form now blocks saving into those states.
      const fetchedServices = (servicesData as PublicService[] | null) || []
      setServices(
        fetchedServices.filter((s) => {
          if (s.pricing_mode === 'preset') return s.duration_options.length > 0
          if (s.pricing_mode === 'hourly') return !!(s.hourly_rate || s.hourly_rate_usd)
          return true
        })
      )
      setBusinessHours((hoursData as PublicBusinessHour[] | null) || [])
      setVisibleMonth(todayInTz(biz.timezone).slice(0, 8) + '01')
      setLoading(false)
    }
    load()
  }, [slug])

  const tz = business?.timezone || 'America/Lima'

  // Distinguishes "the business doesn't open this day" from "open but fully
  // booked" for the empty-slots message below - both show 0 slots otherwise.
  const dayClosed = !!selectedDate && isDayClosed(selectedDate, businessHours, tz)
  // The chosen barber doesn't work this day even though the business is
  // open - worth saying so instead of a generic "no times available".
  const workerDayOff =
    !dayClosed &&
    !!selectedDate &&
    !!selectedWorker &&
    selectedWorker.hours.length > 0 &&
    isDayClosed(selectedDate, selectedWorker.hours, tz)

  // Today's hours are simply over (e.g. checking at night) - not the same
  // as "fully booked", which would wrongly tell a client the shop is full.
  const dayIsOver =
    !!selectedDate &&
    slots.length === 0 &&
    selectedDate === todayInTz(tz) &&
    generateAvailableSlots(selectedDate, businessHours, effectiveDurationMinutes, [], tz).length === 0 &&
    generateAvailableSlots(selectedDate, businessHours, effectiveDurationMinutes, [], tz, 0, 0, true).length > 0

  useEffect(() => {
    if (step !== 'datetime' || !business || !selectedService || !visibleMonth || !effectiveDurationMinutes) return
    let cancelled = false
    const loadMonth = async () => {
      setLoadingSlots(true)
      setSelectedSlot(null)
      const monthEndStr = addMonths(visibleMonth, 1)
      const dayStart = parseInTimezone(`${visibleMonth}T00:00`, tz)
      const dayEnd = parseInTimezone(`${monthEndStr}T00:00`, tz)
      const today = todayInTz(tz)
      const days: string[] = []
      for (let d = visibleMonth; d < monthEndStr; d = addDays(d, 1)) {
        if (d >= today) days.push(d)
      }

      // No resource picked because this service has several and
      // client_chooses_resource is off (scripts/096) - a time is only
      // unavailable if EVERY linked resource is busy then, so fetch each
      // one's own busy times and union their available slots, instead of
      // querying with a null resource_id (get_public_busy_times returns
      // nothing for that - it would read as "nothing is ever busy").
      const candidateResourceIds: (string | null)[] =
        !selectedResourceId && selectedService.resources.length > 1
          ? selectedService.resources.map((r) => r.id)
          : [selectedResourceId]

      type Busy = { start_time: string; end_time: string }[]
      // One request per resource/worker for the whole month, then every
      // day is computed locally from those - not 30 requests per month.
      const resourceBusy = await Promise.all(
        candidateResourceIds.map(async (resourceId) => {
          const { data } = await supabase.rpc('get_public_busy_times', {
            p_business_id: business.id,
            p_resource_id: resourceId,
            p_from: dayStart.toISOString(),
            p_to: dayEnd.toISOString(),
          })
          return (data as Busy | null) || []
        })
      )

      const eligible = eligibleWorkersFor(selectedService)
      const candidates = selectedWorkerId ? eligible.filter((w) => w.id === selectedWorkerId) : eligible
      const workerBusy = await Promise.all(
        candidates.map(async (worker) => {
          const { data } = await supabase.rpc('get_public_worker_busy_times', {
            p_business_id: business.id,
            p_worker_id: worker.id,
            p_from: dayStart.toISOString(),
            p_to: dayEnd.toISOString(),
          })
          return (data as Busy | null) || []
        })
      )
      if (cancelled) return

      const unionSlots = (sets: Date[][]) => {
        const seen = new Set<number>()
        return sets
          .flat()
          .filter((slot) => {
            if (seen.has(slot.getTime())) return false
            seen.add(slot.getTime())
            return true
          })
          .sort((a, b) => a.getTime() - b.getTime())
      }

      const slotsOn = (date: string, hours: PublicBusinessHour[], busy: Busy) =>
        generateAvailableSlots(
          date,
          hours,
          effectiveDurationMinutes,
          busy,
          tz,
          selectedService.buffer_before_min || 0,
          selectedService.buffer_after_min || 0
        )

      const byDay: Record<string, Date[]> = {}
      for (const date of days) {
        let available = unionSlots(resourceBusy.map((busy) => slotsOn(date, businessHours, busy)))
        // Worker constraint (scripts/102), layered on top of the resource
        // one: a time works if a resource is free AND the chosen worker
        // (or, for "Sin preferencia", at least one eligible worker) is
        // working and free then - same intersectSlots approach the
        // dashboard uses for business hours vs. a worker's own schedule.
        if (eligible.length > 0) {
          const perWorker = candidates.map((worker, i) => {
            const businessSlots = slotsOn(date, businessHours, workerBusy[i])
            return worker.hours.length > 0
              ? intersectSlots(businessSlots, slotsOn(date, worker.hours, workerBusy[i]))
              : businessSlots
          })
          available = intersectSlots(available, unionSlots(perWorker))
        }
        byDay[date] = available
      }

      setSlotsByDay(byDay)
      setLoadingSlots(false)
    }
    loadMonth()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, business, selectedService, selectedResourceId, selectedWorkerId, workers, visibleMonth, businessHours, effectiveDurationMinutes])

  // "Option A" from the client-accounts conversation (no login, no
  // accounts) - create_public_reservation already recognizes a returning
  // client by email/phone and backfills their record on submit
  // (scripts/064/072/098), but only finds out AFTER they've retyped
  // everything. This offers the same match earlier, while they're still
  // typing, so they can just confirm it instead. Never overrides a name
  // they've already typed themselves - only looks once the name field is
  // still empty, and only once the email/phone they typed looks real
  // enough to be worth a lookup (not on every keystroke).
  useEffect(() => {
    if (step !== 'contact' || !business) return
    if (contactForm.name.trim() !== '') {
      setClientMatch(null)
      return
    }

    const email = contactForm.email.trim()
    const phone = contactForm.phone.trim()
    const emailLooksReal = email.includes('@') && email.includes('.')
    const phoneLooksReal = phone.replace(/\D/g, '').length >= 7
    if (!emailLooksReal && !phoneLooksReal) {
      setClientMatch(null)
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc('find_public_client_match', {
        p_slug: slug,
        p_email: emailLooksReal ? email : null,
        p_phone: phoneLooksReal ? phone : null,
      })
      if (cancelled) return
      const result = data as { match: boolean; name?: string; email?: string | null; phone?: string | null } | null
      if (result?.match && result.name) {
        setClientMatch({ name: result.name, email: result.email ?? null, phone: result.phone ?? null })
        setMatchDismissed(false)
      } else {
        setClientMatch(null)
      }
    }, 600)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [step, business, slug, contactForm.name, contactForm.email, contactForm.phone])

  const handleConfirmClientMatch = () => {
    if (!clientMatch) return
    setContactForm((prev) => ({
      ...prev,
      name: clientMatch.name,
      email: prev.email || clientMatch.email || '',
      phone: prev.phone || clientMatch.phone || '',
    }))
    setMatchDismissed(true)
  }

  // Checks parking as soon as a slot is picked, instead of only finding out
  // after the client fills the whole contact form and hits submit -
  // find_available_parking_resource (scripts/035-parking.sql) is the exact
  // same read-only check create_public_reservation itself uses as a
  // pre-flight, already granted to anon, so this is safe to call directly
  // for a live preview. The database's own exclusion constraint is still
  // the real guarantee against a race condition at submit time - this is
  // purely a UX improvement, not a new source of truth.
  useEffect(() => {
    if (!business?.offers_parking || !selectedSlot || !effectiveDurationMinutes) {
      setParkingAvailability(null)
      return
    }
    let cancelled = false
    setParkingAvailability('checking')
    const endTime = new Date(selectedSlot.getTime() + effectiveDurationMinutes * 60000)
    supabase
      .rpc('find_available_parking_resource', {
        p_business_id: business.id,
        p_start: selectedSlot.toISOString(),
        p_end: endTime.toISOString(),
      })
      .then(({ data }) => {
        if (cancelled) return
        const available = !!data
        setParkingAvailability(available ? 'available' : 'unavailable')
        if (!available) setNeedsParking(false)
      })
    return () => {
      cancelled = true
    }
  }, [business?.id, business?.offers_parking, selectedSlot, effectiveDurationMinutes])

  const goToResourceOrDatetime = (svc: PublicService) => {
    if (needsResourceStep(svc)) {
      setSelectedResourceId(null)
      setStep('resource')
    } else {
      // svc.resources.length <= 1: only one real choice, auto-select it (or
      // null if the service has none at all). More than one but
      // client_chooses_resource is off: leave it null on purpose - the
      // slot search below then checks every linked resource instead of
      // just one, and the server auto-assigns whichever is free.
      setSelectedResourceId(svc.resources.length <= 1 ? svc.resources[0]?.id ?? null : null)
      goToWorkerOrDatetime(svc)
    }
  }

  const goToWorkerOrDatetime = (svc: PublicService) => {
    const eligible = eligibleWorkersFor(svc)
    if (eligible.length > 1) {
      setSelectedWorkerId(null)
      setStep('worker')
    } else {
      setSelectedWorkerId(eligible[0]?.id ?? null)
      setStep('datetime')
    }
  }

  const stepBeforeDatetime = (svc: PublicService): Step =>
    needsWorkerStep(svc) ? 'worker' : needsResourceStep(svc) ? 'resource' : stepBeforeResource(svc)

  // Which step comes right before the resource/datetime steps, for back
  // buttons - depends on how this service resolves its duration.
  const stepBeforeResource = (svc: PublicService): Step =>
    svc.pricing_mode === 'preset' ? 'duration' : svc.pricing_mode === 'hourly' ? 'hours' : 'service'

  const handleSelectService = (svc: PublicService) => {
    setSelectedService(svc)
    setSelectedDurationOptionId(null)
    setSelectedHours('')
    if (svc.pricing_mode === 'preset') {
      setStep('duration')
    } else if (svc.pricing_mode === 'hourly') {
      setStep('hours')
    } else {
      goToResourceOrDatetime(svc)
    }
  }

  const handleSelectDurationOption = (optionId: string) => {
    setSelectedDurationOptionId(optionId)
    if (selectedService) goToResourceOrDatetime(selectedService)
  }

  const handleConfirmHours = () => {
    if (selectedService) goToResourceOrDatetime(selectedService)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!business || !selectedService || !selectedSlot) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const response = await fetch('/api/public/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_slug: slug,
          p_service_id: selectedService.id,
          p_resource_id: selectedResourceId,
          p_start_time: selectedSlot.toISOString(),
          p_client_name: contactForm.name,
          p_client_email: contactForm.email || null,
          p_client_phone: contactForm.phone || null,
          p_notes: contactForm.notes || null,
          p_duration_option_id: selectedDurationOptionId,
          p_needs_parking: needsParking,
          p_hours: selectedHours || null,
          p_document_number: contactForm.documentNumber || null,
          p_worker_id: selectedWorkerId,
          turnstileToken,
        }),
      })
      const result = (await response.json()) as { success?: boolean; error?: string; reservation_id?: string }
      if (!response.ok || result.error) {
        const messages: Record<string, string> = {
          time_conflict: tr.errorTimeConflict,
          time_in_past: tr.errorTimeConflict,
          name_required: tr.errorNameRequired,
          contact_required: tr.errorContactRequired,
          duration_option_not_found: tr.errorGeneric,
          parking_unavailable: tr.errorParkingUnavailable,
          invalid_hours: tr.errorGeneric,
          business_reservation_limit_reached: tr.errorBusinessAtCapacity,
          rate_limited: tr.errorRateLimited,
          name_too_long: tr.errorNameTooLong,
          invalid_email: tr.errorInvalidEmail,
          phone_too_long: tr.errorPhoneTooLong,
          notes_too_long: tr.errorNotesTooLong,
          document_number_too_long: tr.errorDocumentNumberTooLong,
          bot_verification_failed: tr.errorBotVerification,
          worker_unavailable: tr.errorWorkerUnavailable,
          time_blocked: tr.errorTimeBlocked,
        }
        setSubmitError(messages[result.error || ''] || tr.errorGeneric)
        resetTurnstile()
        return
      }
      setManageReservationId(result.reservation_id || null)
      setAssignedWorker(null)
      if (result.reservation_id && !selectedWorkerId && workers.length > 0) {
        const { data: status } = await supabase.rpc('get_public_reservation_status', {
          p_reservation_id: result.reservation_id,
        })
        const s = status as { worker_name?: string | null; worker_photo_url?: string | null } | null
        if (s?.worker_name) setAssignedWorker({ name: s.worker_name, photo_url: s.worker_photo_url ?? null })
      }
      if (result.reservation_id && business.notify_confirmations && contactForm.email) {
        sendReservationNotification('confirmation', result.reservation_id, language)
      }
      // Kommo sync (proof of concept, single shared account) - see
      // components/dashboard/reservation-modal.tsx's own call for why this
      // fires independently of the email-notification condition above.
      if (result.reservation_id) {
        syncReservationToKommo(result.reservation_id)
      }
      setStep('success')
    } catch (err) {
      console.error('[v0] Error creating public reservation:', err)
      setSubmitError(tr.errorGeneric)
      resetTurnstile()
    } finally {
      setSubmitting(false)
    }
  }

  const priceLabel = (svc: PublicService) => {
    if (svc.pricing_mode === 'preset') {
      const prices = svc.duration_options
        .map((o) => o.price_usd ?? o.price)
        .filter((p): p is number => p != null)
      if (prices.length === 0) return ''
      const min = Math.min(...prices)
      const isUsd = svc.duration_options.some((o) => o.price_usd != null)
      return `${tr.fromPrice} ${isUsd ? '$' : 'S/'} ${min}`
    }
    if (svc.pricing_mode === 'hourly') {
      const rate = svc.hourly_rate_usd ?? svc.hourly_rate
      if (!rate) return ''
      return `${svc.hourly_rate_usd ? '$' : 'S/'} ${rate}${tr.perHourShort}`
    }
    return svc.price_usd ? `$ ${svc.price_usd}` : svc.price ? `S/ ${svc.price}` : ''
  }

  const optionPriceLabel = (option: PublicDurationOption) =>
    option.price_usd ? `$ ${option.price_usd}` : option.price ? `S/ ${option.price}` : ''

  if (loading) {
    return (
      <div
        className={cn(
          'booking-shell flex items-center justify-center bg-background',
          isEmbed ? 'py-16' : 'min-h-screen'
        )}
      >
        <LogoLoader />
      </div>
    )
  }

  if (notFound || !business) {
    return (
      <div
        className={cn(
          'booking-shell flex flex-col items-center justify-center gap-3 bg-background px-4 text-center',
          isEmbed ? 'py-16' : 'min-h-screen'
        )}
      >
        <Building2 className="h-10 w-10 text-muted-foreground/50" />
        <h1 className="text-xl font-semibold">{tr.notFoundTitle}</h1>
        <p className="text-sm text-muted-foreground">{tr.notFoundDesc}</p>
      </div>
    )
  }

  const stepSequence = selectedService ? getStepSequence(selectedService, needsWorkerStep(selectedService)) : []
  const stepIndex = stepSequence.indexOf(step)

  return (
    <div
      className={cn(
        'booking-shell flex flex-col items-center bg-background px-4',
        isEmbed ? 'py-6' : 'min-h-screen py-10'
      )}
      style={bookingBrandStyle(business.booking_font, business.booking_accent_color)}
    >
      <LanguageToggle className={cn('max-w-md', isEmbed && 'mb-2')} />

      <div className="mb-6 flex w-full max-w-md flex-col items-center text-center">
        <Avatar className="h-16 w-16 rounded-2xl shadow-sm">
          <SmartAvatarImage src={business.logo_url || undefined} alt={business.name} className="object-cover" />
          <AvatarFallback className="rounded-2xl bg-primary/10">
            <Building2 className="h-8 w-8 text-primary" />
          </AvatarFallback>
        </Avatar>
        <h1 className="mt-4 font-display text-3xl text-foreground">{business.name}</h1>
        {business.description && (
          <p className="mt-1.5 text-sm text-muted-foreground">{business.description}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {business.address && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {business.address}
            </span>
          )}
          {business.phone && (
            <span className="flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" />
              {business.phone}
            </span>
          )}
        </div>
      </div>

      <Card className="w-full max-w-md border-none shadow-lg shadow-foreground/5">
        {step === 'success' ? (
          <CardContent className="flex flex-col items-center gap-0 px-4 py-8 text-center sm:px-6">
            <Confetti />
            <span className="-rotate-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--confirm)] px-3 py-1 text-xs font-medium text-[var(--confirm)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {tr.successTitle}
            </span>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">{tr.successDesc}</p>

            {selectedService && selectedSlot && (
              <div className="mt-5 w-full">
                <p className="text-sm text-muted-foreground">
                  {capitalizeFirst(
                    selectedSlot.toLocaleDateString(locale, {
                      timeZone: tz,
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })
                  )}
                </p>
                <p className="font-display text-4xl text-foreground sm:text-5xl">
                  {selectedSlot.toLocaleTimeString(locale, { timeZone: tz, hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="mt-1 font-display text-lg text-foreground">{selectedService.name}</p>
                {confirmedWorker && (
                  <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={confirmedWorker.photo_url || undefined} alt="" className="object-cover" />
                      <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
                        {workerInitials(confirmedWorker.name)}
                      </AvatarFallback>
                    </Avatar>
                    {tr.withWorker.replace('{name}', confirmedWorker.name)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{business.name}</p>
              </div>
            )}

            {needsParking && (
              <p className="mt-3 flex items-center gap-2 text-sm text-[var(--confirm)]">
                <ParkingSquare className="h-4 w-4 shrink-0" />
                {tr.parkingConfirmed}
              </p>
            )}

            {manageReservationId && (
              <>
                <div className="ticket-tear mt-6 w-full" />
                <div className="w-full space-y-2 pt-4 text-left">
                  <p className="text-xs font-medium text-foreground">{tr.manageLinkTitle}</p>
                  <p className="text-xs text-muted-foreground">{tr.manageLinkDesc}</p>
                  <div className="flex gap-2">
                    <Input
                      ref={manageLinkInputRef}
                      readOnly
                      value={typeof window !== 'undefined' ? `${window.location.origin}/reservar/cita/${manageReservationId}` : ''}
                      className="font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={async () => {
                        const link = `${window.location.origin}/reservar/cita/${manageReservationId}`
                        try {
                          // navigator.clipboard is missing or throws
                          // (NotAllowedError) in several mobile in-app browsers
                          // - notably WhatsApp's own webview, which is exactly
                          // where a client opens this link from after getting
                          // it in a WhatsApp message. Fall back to selecting
                          // the (already visible, read-only) input's text so
                          // they can still copy it via their phone's own
                          // selection menu instead of hitting an unhandled error.
                          if (!navigator.clipboard) throw new Error('Clipboard API unavailable')
                          await navigator.clipboard.writeText(link)
                          setLinkCopied(true)
                          setTimeout(() => setLinkCopied(false), 2000)
                        } catch (err) {
                          console.error('[iplanit] Clipboard write failed, falling back to text selection:', err)
                          manageLinkInputRef.current?.select()
                          manageLinkInputRef.current?.setSelectionRange(0, link.length)
                        }
                      }}
                    >
                      {linkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        ) : (
          <>
            <CardHeader className="px-4 sm:px-6">
              {stepIndex >= 0 && (
                <div className="booking-steps mb-1">
                  {stepSequence.map((s, i) => (
                    <span key={s} data-done={i <= stepIndex} />
                  ))}
                </div>
              )}
              <CardTitle className="font-display text-2xl font-normal">
                {step === 'service' && tr.stepService}
                {step === 'duration' && tr.stepDuration}
                {step === 'hours' && tr.stepHours}
                {step === 'resource' && tr.stepResource}
                {step === 'worker' && tr.stepWorker}
                {step === 'datetime' && tr.stepDatetime}
                {step === 'contact' && tr.stepContact}
              </CardTitle>
              <CardDescription>
                {step === 'service' && tr.stepServiceDesc}
                {step === 'duration' && tr.stepDurationDesc}
                {step === 'hours' && tr.stepHoursDesc}
                {step === 'resource' && tr.stepResourceDesc}
                {step === 'worker' && tr.stepWorkerDesc}
                {step === 'datetime' && tr.stepDatetimeDesc}
                {step === 'contact' && tr.stepContactDesc}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-4 sm:px-6">
              <div key={step} className="animate-page-fade-in space-y-4">
              {step === 'service' && (
                <div className="space-y-2">
                  {services.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">{tr.noServices}</p>
                  ) : (
                    services.map((svc) => (
                      <button
                        key={svc.id}
                        type="button"
                        onClick={() => handleSelectService(svc)}
                        className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                      >
                        {svc.image_url ? (
                          <img
                            src={svc.image_url}
                            alt=""
                            className="h-14 w-14 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: svc.color }} />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-display text-base text-foreground">{svc.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {svc.pricing_mode === 'preset' && tr.flexibleDurationTag}
                            {svc.pricing_mode === 'hourly' && tr.hourlyTag}
                            {svc.pricing_mode === 'fixed' && `${svc.duration_minutes} min`}
                            {priceLabel(svc) && ` · ${priceLabel(svc)}`}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))
                  )}
                </div>
              )}

              {step === 'duration' && selectedService && (
                <div className="space-y-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-3 gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setStep('service')}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {tr.back}
                  </Button>
                  <div className="space-y-2">
                    {selectedService.duration_options.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">{tr.noDurationOptions}</p>
                    ) : (
                      selectedService.duration_options.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => handleSelectDurationOption(option.id)}
                          className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                        >
                          <span className="flex-1 font-medium">
                            {option.duration_minutes} min
                            {optionPriceLabel(option) && ` · ${optionPriceLabel(option)}`}
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {step === 'hours' && selectedService && (
                <div className="space-y-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-3 gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setStep('service')}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {tr.back}
                  </Button>
                  <div className="space-y-2">
                    <Label htmlFor="pb-hours">{tr.hoursLabel}</Label>
                    <Input
                      id="pb-hours"
                      type="number"
                      min={selectedService.min_hours ?? 1}
                      max={selectedService.max_hours ?? undefined}
                      step={1}
                      value={selectedHours}
                      onChange={(e) => setSelectedHours(e.target.value !== '' ? parseInt(e.target.value) : '')}
                    />
                    <p className="text-xs text-muted-foreground">
                      {tr.hoursRangeHint
                        .replace('{min}', String(selectedService.min_hours ?? 1))
                        .replace('{max}', String(selectedService.max_hours ?? '—'))}
                    </p>
                    {selectedHours !== '' && (selectedService.hourly_rate_usd ?? selectedService.hourly_rate) && (
                      <p className="text-sm font-medium">
                        {tr.totalPriceLabel}: {selectedService.hourly_rate_usd ? '$' : 'S/'}{' '}
                        {selectedHours * (selectedService.hourly_rate_usd ?? selectedService.hourly_rate ?? 0)}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={
                      selectedHours === '' ||
                      selectedHours < (selectedService.min_hours ?? 1) ||
                      selectedHours > (selectedService.max_hours ?? Infinity)
                    }
                    onClick={handleConfirmHours}
                  >
                    {tr.continueBtn}
                  </Button>
                </div>
              )}

              {step === 'resource' && selectedService && (
                <div className="space-y-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-3 gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setStep(stepBeforeResource(selectedService))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {tr.back}
                  </Button>
                  <div className="space-y-2">
                    {selectedService.resources.map((res) => (
                      <button
                        key={res.id}
                        type="button"
                        onClick={() => {
                          setSelectedResourceId(res.id)
                          goToWorkerOrDatetime(selectedService)
                        }}
                        className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: res.color }} />
                        <span className="font-display flex-1 text-base text-foreground">{res.name}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 'worker' && selectedService && (
                <div className="space-y-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-3 gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setStep(needsResourceStep(selectedService) ? 'resource' : stepBeforeResource(selectedService))
                    }
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {tr.back}
                  </Button>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedWorkerId(null)
                        setStep('datetime')
                      }}
                      className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Users className="h-5 w-5 text-muted-foreground" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-base text-foreground">{tr.anyWorker}</span>
                        <span className="block text-xs text-muted-foreground">{tr.anyWorkerDesc}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                    {eligibleWorkersFor(selectedService).map((worker) => (
                      <button
                        key={worker.id}
                        type="button"
                        onClick={() => {
                          setSelectedWorkerId(worker.id)
                          setStep('datetime')
                        }}
                        className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                      >
                        <Avatar className="h-12 w-12 shrink-0">
                          <AvatarImage src={worker.photo_url || undefined} alt={worker.name} className="object-cover" />
                          <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                            {workerInitials(worker.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-display min-w-0 flex-1 truncate text-base text-foreground">
                          {worker.name}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 'datetime' && selectedService && (
                <div className="space-y-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-3 gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setStep(stepBeforeDatetime(selectedService))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {tr.back}
                  </Button>

                  <BookingMonthCalendar
                    month={visibleMonth}
                    today={todayInTz(tz)}
                    slotsByDay={slotsByDay}
                    loading={loadingSlots}
                    selectedDate={selectedDate}
                    weekStartsMonday={business.country !== 'US'}
                    locale={locale}
                    onSelectDate={(date) => {
                      setSelectedDate(date)
                      setSelectedSlot(null)
                    }}
                    onMonthChange={(month) => {
                      setVisibleMonth(month)
                      setSelectedDate('')
                      setSelectedSlot(null)
                    }}
                    labels={{ previousMonth: tr.previousMonth, nextMonth: tr.nextMonth, noAvailability: tr.dayNoAvailability }}
                  />

                  {!selectedDate ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      {loadingSlots
                        ? tr.loadingAvailability
                        : Object.values(slotsByDay).some((d) => d.length > 0)
                          ? tr.pickDayPrompt
                          : tr.noAvailabilityThisMonth}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-foreground">
                        {capitalizeFirst(
                          new Date(selectedDate + 'T12:00:00Z').toLocaleDateString(locale, {
                            timeZone: 'UTC',
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                          })
                        )}
                      </p>
                      {slots.length === 0 ? (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                          {dayClosed
                            ? tr.dayClosed
                            : workerDayOff && selectedWorker
                              ? tr.workerDayOff.replace('{name}', selectedWorker.name)
                              : dayIsOver
                                ? tr.dayIsOver
                                : tr.noSlots}
                        </p>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {slots.map((slot) => (
                            <Button
                              key={slot.toISOString()}
                              type="button"
                              variant={selectedSlot?.getTime() === slot.getTime() ? 'default' : 'outline'}
                              onClick={() => setSelectedSlot(slot)}
                            >
                              {slot.toLocaleTimeString(locale, { timeZone: tz, hour: '2-digit', minute: '2-digit' })}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <Button
                    type="button"
                    className="w-full"
                    disabled={!selectedSlot}
                    onClick={() => setStep('contact')}
                  >
                    {tr.continueBtn}
                  </Button>
                </div>
              )}

              {step === 'contact' && selectedService && selectedSlot && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-3 gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setStep('datetime')}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {tr.back}
                  </Button>

                  <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                    <p className="font-display text-base text-foreground">
                      {selectedService.name}
                      {selectedDurationOption &&
                        ` (${selectedDurationOption.duration_minutes} min${
                          optionPriceLabel(selectedDurationOption) ? ` · ${optionPriceLabel(selectedDurationOption)}` : ''
                        })`}
                      {selectedService.pricing_mode === 'hourly' && selectedHours !== '' && ` (${selectedHours} h)`}
                    </p>
                    <p className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {capitalizeFirst(
                        selectedSlot.toLocaleDateString(locale, {
                          timeZone: tz,
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      )}
                    </p>
                    {selectedWorker && (
                      <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={selectedWorker.photo_url || undefined} alt="" className="object-cover" />
                          <AvatarFallback className="bg-primary/10 text-[9px] text-primary">
                            {workerInitials(selectedWorker.name)}
                          </AvatarFallback>
                        </Avatar>
                        {tr.withWorker.replace('{name}', selectedWorker.name)}
                      </p>
                    )}
                  </div>

                  {submitError && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{submitError}</div>
                  )}

                  {clientMatch && !matchDismissed && (
                    <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div className="flex-1 text-sm">
                        <p className="text-foreground">
                          {tr.returningClientPrompt.replace('{name}', clientMatch.name)}
                        </p>
                        <div className="mt-2 flex gap-2">
                          <Button type="button" size="sm" onClick={handleConfirmClientMatch}>
                            {tr.returningClientConfirm}
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setMatchDismissed(true)}>
                            {tr.returningClientDeny}
                          </Button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMatchDismissed(true)}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        aria-label={tr.returningClientDeny}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="pb-name">{tr.nameLabel}</Label>
                    <Input
                      id="pb-name"
                      value={contactForm.name}
                      onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                      required
                      maxLength={200}
                      disabled={submitting}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="pb-email">{tr.emailLabel}</Label>
                      <Input
                        id="pb-email"
                        type="email"
                        value={contactForm.email}
                        onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                        maxLength={320}
                        disabled={submitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pb-phone">{tr.phoneLabel}</Label>
                      <PhoneInput
                        id="pb-phone"
                        value={contactForm.phone}
                        onChange={(phone) => setContactForm({ ...contactForm, phone })}
                        defaultCountry={business.country === 'US' ? 'US' : 'PE'}
                        disabled={submitting}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{tr.contactHint}</p>
                  <div className="space-y-2">
                    <Label htmlFor="pb-document">{tr.documentLabel}</Label>
                    <Input
                      id="pb-document"
                      value={contactForm.documentNumber}
                      onChange={(e) => setContactForm({ ...contactForm, documentNumber: e.target.value })}
                      maxLength={50}
                      disabled={submitting}
                    />
                    <p className="text-xs text-muted-foreground">{tr.documentHint}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pb-notes">{tr.notesLabel}</Label>
                    <Textarea
                      id="pb-notes"
                      rows={2}
                      value={contactForm.notes}
                      onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                      maxLength={2000}
                      disabled={submitting}
                    />
                  </div>

                  {business.offers_parking && (
                    <div className="space-y-1.5">
                      <label
                        className={cn(
                          'flex items-center gap-2 rounded-lg border p-3 text-sm',
                          parkingAvailability === 'unavailable' && 'opacity-60'
                        )}
                      >
                        <Checkbox
                          checked={needsParking}
                          onCheckedChange={(checked) => setNeedsParking(checked === true)}
                          disabled={submitting || parkingAvailability === 'unavailable'}
                        />
                        <ParkingSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                        {tr.needsParkingLabel}
                      </label>
                      {parkingAvailability === 'checking' && (
                        <p className="pl-1 text-xs text-muted-foreground">{tr.checkingParkingAvailability}</p>
                      )}
                      {parkingAvailability === 'available' && (
                        <p className="flex items-center gap-1 pl-1 text-xs text-[var(--confirm)]">
                          <Check className="h-3 w-3 shrink-0" />
                          {tr.parkingAvailableAtSlot}
                        </p>
                      )}
                      {parkingAvailability === 'unavailable' && (
                        <p className="pl-1 text-xs text-amber-600 dark:text-amber-400">
                          {tr.parkingUnavailableAtSlot}
                        </p>
                      )}
                    </div>
                  )}

                  <TurnstileWidget ref={turnstileRef} onVerify={setTurnstileToken} onExpire={() => setTurnstileToken(null)} />

                  <Button type="submit" className="w-full gap-2" disabled={submitting || !contactForm.name}>
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {tr.confirmBtn}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">{tr.pendingHint}</p>
                </form>
              )}
              </div>
            </CardContent>
          </>
        )}
      </Card>

      <p className="mt-6 text-xs text-muted-foreground">{tr.poweredBy}</p>
      <div className="mt-1 flex gap-3 text-[11px] text-muted-foreground">
        <Link href="/terms" className="hover:underline">{t.legalTerms}</Link>
        <Link href="/privacy" className="hover:underline">{t.legalPrivacy}</Link>
      </div>
    </div>
  )
}
