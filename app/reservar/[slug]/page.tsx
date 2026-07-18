'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Confetti } from '@/components/confetti'
import { useLanguage } from '@/context/language-context'
import { capitalizeFirst } from '@/lib/utils'
import { parseInTimezone, getTzDayOfWeek } from '@/lib/timezone'

interface PublicBusiness {
  id: string
  name: string
  description: string | null
  address: string | null
  phone: string | null
  timezone: string
  logo_url: string | null
}

interface PublicResource {
  id: string
  name: string
  color: string
}

interface PublicService {
  id: string
  name: string
  description: string | null
  duration_minutes: number
  price: number
  price_usd: number | null
  color: string
  resources: PublicResource[]
}

interface PublicBusinessHour {
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: boolean
}

type Step = 'service' | 'resource' | 'datetime' | 'contact' | 'success'

const SLOT_INTERVAL_MINUTES = 30

function toMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function generateSlots(
  dateStr: string,
  hours: PublicBusinessHour[],
  durationMinutes: number,
  busy: { start_time: string; end_time: string }[],
  tz: string
): Date[] {
  const dayOfWeek = getTzDayOfWeek(dateStr, tz)
  const bh = hours.find((h) => h.day_of_week === dayOfWeek)

  let openMinutes: number
  let closeMinutes: number
  if (hours.length === 0) {
    // Owner hasn't configured business hours yet - default to a permissive
    // range instead of looking fully booked to every visitor. Matches the
    // internal reservation modal's own fallback (hoursError skips the
    // check entirely when businessHours is empty).
    openMinutes = 7 * 60
    closeMinutes = 21 * 60
  } else {
    if (!bh || bh.is_closed) return []
    openMinutes = toMinutes(bh.open_time)
    closeMinutes = toMinutes(bh.close_time)
  }

  const busyRanges = busy.map((b) => ({ start: new Date(b.start_time), end: new Date(b.end_time) }))
  const now = new Date()
  const slots: Date[] = []

  for (let m = openMinutes; m + durationMinutes <= closeMinutes; m += SLOT_INTERVAL_MINUTES) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0')
    const mm = String(m % 60).padStart(2, '0')
    const slotStart = parseInTimezone(`${dateStr}T${hh}:${mm}`, tz)
    const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000)
    if (slotStart < now) continue
    if (busyRanges.some((b) => slotStart < b.end && slotEnd > b.start)) continue
    slots.push(slotStart)
  }
  return slots
}

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
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null)

  const [selectedDate, setSelectedDate] = useState('')
  const [slots, setSlots] = useState<Date[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<Date | null>(null)

  const [contactForm, setContactForm] = useState({ name: '', email: '', phone: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

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
      setServices((servicesData as PublicService[] | null) || [])
      setBusinessHours((hoursData as PublicBusinessHour[] | null) || [])
      setSelectedDate(todayInTz(biz.timezone))
      setLoading(false)
    }
    load()
  }, [slug])

  const tz = business?.timezone || 'America/Lima'

  useEffect(() => {
    if (step !== 'datetime' || !business || !selectedService || !selectedDate) return
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
      setSlots(generateSlots(selectedDate, businessHours, selectedService.duration_minutes, busy, tz))
      setLoadingSlots(false)
    }
    loadSlots()
  }, [step, business, selectedService, selectedResourceId, selectedDate, businessHours])

  const handleSelectService = (svc: PublicService) => {
    setSelectedService(svc)
    if (svc.resources.length > 1) {
      setSelectedResourceId(null)
      setStep('resource')
    } else {
      setSelectedResourceId(svc.resources[0]?.id ?? null)
      setStep('datetime')
    }
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
      })
      if (error) throw error
      const result = data as { success?: boolean; error?: string }
      if (result.error) {
        const messages: Record<string, string> = {
          time_conflict: tr.errorTimeConflict,
          time_in_past: tr.errorTimeConflict,
          name_required: tr.errorNameRequired,
          contact_required: tr.errorContactRequired,
        }
        setSubmitError(messages[result.error] || tr.errorGeneric)
        return
      }
      setStep('success')
    } catch (err) {
      console.error('[v0] Error creating public reservation:', err)
      setSubmitError(tr.errorGeneric)
    } finally {
      setSubmitting(false)
    }
  }

  const priceLabel = (svc: PublicService) =>
    svc.price_usd ? `$ ${svc.price_usd}` : svc.price ? `S/ ${svc.price}` : ''

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
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle>
                {step === 'service' && tr.stepService}
                {step === 'resource' && tr.stepResource}
                {step === 'datetime' && tr.stepDatetime}
                {step === 'contact' && tr.stepContact}
              </CardTitle>
              <CardDescription>
                {step === 'service' && tr.stepServiceDesc}
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
                            {svc.duration_minutes} min
                            {priceLabel(svc) && ` · ${priceLabel(svc)}`}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))
                  )}
                </div>
              )}

              {step === 'resource' && selectedService && (
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
                    onClick={() => setStep(selectedService.resources.length > 1 ? 'resource' : 'service')}
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
                    <p className="font-medium">{selectedService.name}</p>
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
