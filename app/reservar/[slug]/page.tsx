'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  ParkingSquare,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Confetti } from '@/components/confetti'
import { useLanguage } from '@/context/language-context'
import { capitalizeFirst } from '@/lib/utils'
import { parseInTimezone } from '@/lib/timezone'
import { generateAvailableSlots } from '@/lib/availability'

interface PublicBusiness {
  id: string
  name: string
  description: string | null
  address: string | null
  phone: string | null
  timezone: string
  logo_url: string | null
  offers_parking: boolean
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
  pricing_mode: 'fixed' | 'preset' | 'hourly'
  hourly_rate: number | null
  hourly_rate_usd: number | null
  min_hours: number | null
  max_hours: number | null
  duration_options: PublicDurationOption[]
  resources: PublicResource[]
}

interface PublicBusinessHour {
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: boolean
}

type Step = 'service' | 'duration' | 'hours' | 'resource' | 'datetime' | 'contact' | 'success'

function todayInTz(tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function PublicBookingPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug
  const supabase = createClient()
  const { language, setLanguage, t, locale } = useLanguage()
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

  const selectedDurationOption = selectedService?.duration_options.find((o) => o.id === selectedDurationOptionId) ?? null
  const effectiveDurationMinutes =
    selectedService?.pricing_mode === 'preset'
      ? selectedDurationOption?.duration_minutes ?? 0
      : selectedService?.pricing_mode === 'hourly'
        ? (selectedHours || 0) * 60
        : selectedService?.duration_minutes ?? 0

  const [selectedDate, setSelectedDate] = useState('')
  const [slots, setSlots] = useState<Date[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<Date | null>(null)

  const [contactForm, setContactForm] = useState({ name: '', email: '', phone: '', notes: '' })
  const [needsParking, setNeedsParking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [manageReservationId, setManageReservationId] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

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

      const [{ data: servicesData }, { data: hoursData }] = await Promise.all([
        supabase.rpc('get_public_services', { p_business_id: biz.id }),
        supabase.rpc('get_public_business_hours', { p_business_id: biz.id }),
      ])
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
      setSelectedDate(todayInTz(biz.timezone))
      setLoading(false)
    }
    load()
  }, [slug])

  const tz = business?.timezone || 'America/Lima'

  useEffect(() => {
    if (step !== 'datetime' || !business || !selectedService || !selectedDate || !effectiveDurationMinutes) return
    const loadSlots = async () => {
      setLoadingSlots(true)
      setSelectedSlot(null)
      const dayStart = parseInTimezone(`${selectedDate}T00:00`, tz)
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
      const { data } = await supabase.rpc('get_public_busy_times', {
        p_business_id: business.id,
        p_resource_id: selectedResourceId,
        p_from: dayStart.toISOString(),
        p_to: dayEnd.toISOString(),
      })
      const busy = (data as { start_time: string; end_time: string }[] | null) || []
      setSlots(generateAvailableSlots(selectedDate, businessHours, effectiveDurationMinutes, busy, tz))
      setLoadingSlots(false)
    }
    loadSlots()
  }, [step, business, selectedService, selectedResourceId, selectedDate, businessHours, effectiveDurationMinutes])

  const goToResourceOrDatetime = (svc: PublicService) => {
    if (svc.resources.length > 1) {
      setSelectedResourceId(null)
      setStep('resource')
    } else {
      setSelectedResourceId(svc.resources[0]?.id ?? null)
      setStep('datetime')
    }
  }

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
      const { data, error } = await supabase.rpc('create_public_reservation', {
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
      })
      if (error) throw error
      const result = data as { success?: boolean; error?: string; reservation_id?: string }
      if (result.error) {
        const messages: Record<string, string> = {
          time_conflict: tr.errorTimeConflict,
          time_in_past: tr.errorTimeConflict,
          name_required: tr.errorNameRequired,
          contact_required: tr.errorContactRequired,
          duration_option_not_found: tr.errorGeneric,
          parking_unavailable: tr.errorParkingUnavailable,
          invalid_hours: tr.errorGeneric,
        }
        setSubmitError(messages[result.error] || tr.errorGeneric)
        return
      }
      setManageReservationId(result.reservation_id || null)
      setStep('success')
    } catch (err) {
      console.error('[v0] Error creating public reservation:', err)
      setSubmitError(tr.errorGeneric)
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

  const LanguageToggle = (
    <div className="mb-4 flex w-full max-w-lg justify-end">
      <div className="inline-flex overflow-hidden rounded-md border text-xs font-medium">
        <button
          type="button"
          onClick={() => setLanguage('es')}
          className={`px-2.5 py-1 ${language === 'es' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
        >
          ES
        </button>
        <button
          type="button"
          onClick={() => setLanguage('en')}
          className={`border-l px-2.5 py-1 ${language === 'en' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
        >
          EN
        </button>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (notFound || !business) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/30 px-4 text-center">
        <Building2 className="h-10 w-10 text-muted-foreground/50" />
        <h1 className="text-xl font-semibold">{tr.notFoundTitle}</h1>
        <p className="text-sm text-muted-foreground">{tr.notFoundDesc}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-muted/30 px-4 py-10">
      {LanguageToggle}

      <div className="mb-6 flex w-full max-w-lg flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
          <Building2 className="h-7 w-7 text-primary" />
        </div>
        <h1 className="mt-3 text-2xl font-bold text-foreground">{business.name}</h1>
        {business.description && (
          <p className="mt-1 text-sm text-muted-foreground">{business.description}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
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

      <Card className="w-full max-w-lg">
        {step === 'success' ? (
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <Confetti />
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">{tr.successTitle}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{tr.successDesc}</p>
            </div>
            {selectedService && selectedSlot && (
              <div className="w-full rounded-lg border bg-muted/40 p-3 text-left text-sm">
                <p className="font-medium">{selectedService.name}</p>
                <p className="text-muted-foreground">
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
              </div>
            )}
            {needsParking && (
              <div className="flex w-full items-center gap-2 rounded-lg border bg-muted/40 p-3 text-left text-sm text-muted-foreground">
                <ParkingSquare className="h-4 w-4 shrink-0" />
                {tr.parkingConfirmed}
              </div>
            )}
            {manageReservationId && (
              <div className="w-full space-y-2 rounded-lg border border-dashed p-3 text-left">
                <p className="text-xs font-medium text-foreground">{tr.manageLinkTitle}</p>
                <p className="text-xs text-muted-foreground">{tr.manageLinkDesc}</p>
                <div className="flex gap-2">
                  <Input
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
                      await navigator.clipboard.writeText(`${window.location.origin}/reservar/cita/${manageReservationId}`)
                      setLinkCopied(true)
                      setTimeout(() => setLinkCopied(false), 2000)
                    }}
                  >
                    {linkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle>
                {step === 'service' && tr.stepService}
                {step === 'duration' && tr.stepDuration}
                {step === 'hours' && tr.stepHours}
                {step === 'resource' && tr.stepResource}
                {step === 'datetime' && tr.stepDatetime}
                {step === 'contact' && tr.stepContact}
              </CardTitle>
              <CardDescription>
                {step === 'service' && tr.stepServiceDesc}
                {step === 'duration' && tr.stepDurationDesc}
                {step === 'hours' && tr.stepHoursDesc}
                {step === 'resource' && tr.stepResourceDesc}
                {step === 'datetime' && tr.stepDatetimeDesc}
                {step === 'contact' && tr.stepContactDesc}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                        <div className="h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: svc.color }} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{svc.name}</p>
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
                  <button
                    type="button"
                    onClick={() => setStep('service')}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {tr.back}
                  </button>
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
                  <button
                    type="button"
                    onClick={() => setStep('service')}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {tr.back}
                  </button>
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
                  <button
                    type="button"
                    onClick={() => setStep(stepBeforeResource(selectedService))}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {tr.back}
                  </button>
                  <div className="space-y-2">
                    {selectedService.resources.map((res) => (
                      <button
                        key={res.id}
                        type="button"
                        onClick={() => {
                          setSelectedResourceId(res.id)
                          setStep('datetime')
                        }}
                        className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: res.color }} />
                        <span className="flex-1 font-medium">{res.name}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 'datetime' && selectedService && (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() =>
                      setStep(selectedService.resources.length > 1 ? 'resource' : stepBeforeResource(selectedService))
                    }
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {tr.back}
                  </button>

                  <div className="flex items-center justify-between gap-2 rounded-lg border p-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedDate((d) => addDays(d, -1))}
                      disabled={selectedDate <= todayInTz(tz)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                      {capitalizeFirst(
                        new Date(selectedDate + 'T12:00:00Z').toLocaleDateString(locale, {
                          timeZone: 'UTC',
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })
                      )}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedDate((d) => addDays(d, 1))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>

                  {loadingSlots ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : slots.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">{tr.noSlots}</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {slots.map((slot) => (
                        <Button
                          key={slot.toISOString()}
                          type="button"
                          variant={selectedSlot?.getTime() === slot.getTime() ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setSelectedSlot(slot)}
                        >
                          {slot.toLocaleTimeString(locale, { timeZone: tz, hour: '2-digit', minute: '2-digit' })}
                        </Button>
                      ))}
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
                  <button
                    type="button"
                    onClick={() => setStep('datetime')}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {tr.back}
                  </button>

                  <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                    <p className="font-medium">
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
                  </div>

                  {submitError && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{submitError}</div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="pb-name">{tr.nameLabel}</Label>
                    <Input
                      id="pb-name"
                      value={contactForm.name}
                      onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                      required
                      disabled={submitting}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="pb-email">{tr.emailLabel}</Label>
                      <Input
                        id="pb-email"
                        type="email"
                        value={contactForm.email}
                        onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                        disabled={submitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pb-phone">{tr.phoneLabel}</Label>
                      <Input
                        id="pb-phone"
                        type="tel"
                        value={contactForm.phone}
                        onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                        disabled={submitting}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{tr.contactHint}</p>
                  <div className="space-y-2">
                    <Label htmlFor="pb-notes">{tr.notesLabel}</Label>
                    <Textarea
                      id="pb-notes"
                      rows={2}
                      value={contactForm.notes}
                      onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                      disabled={submitting}
                    />
                  </div>

                  {business.offers_parking && (
                    <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                      <Checkbox
                        checked={needsParking}
                        onCheckedChange={(checked) => setNeedsParking(checked === true)}
                        disabled={submitting}
                      />
                      <ParkingSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {tr.needsParkingLabel}
                    </label>
                  )}

                  <Button type="submit" className="w-full gap-2" disabled={submitting || !contactForm.name}>
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {tr.confirmBtn}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">{tr.pendingHint}</p>
                </form>
              )}
            </CardContent>
          </>
        )}
      </Card>

      <p className="mt-6 text-xs text-muted-foreground">{tr.poweredBy}</p>
    </div>
  )
}
