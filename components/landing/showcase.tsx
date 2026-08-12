'use client'

import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import { Reveal } from '@/components/landing/reveal'

// Second product visual, deliberately different from Hero's CalendarMock -
// that one shows the business-owner side (the day grid), this one shows
// what a client sees on the public booking link (app/reservar/[slug]),
// mirroring its real step flow (service -> datetime -> confirm) with the
// same publicBooking copy so the mock doesn't drift from the real product.
function BookingWidgetMock() {
  const { t } = useLanguage()
  const l = t.landing
  const pb = t.publicBooking

  const services = [
    { name: l.showcaseMockService1, duration: '45 min', selected: true },
    { name: l.showcaseMockService2, duration: '30 min', selected: false },
    { name: l.showcaseMockService3, duration: '60 min', selected: false },
  ]
  const slots = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30']
  const selectedSlot = '10:00'

  return (
    <div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-2xl shadow-primary/10 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">{pb.stepService}</p>
      <div className="mt-3 space-y-2">
        {services.map((service) => (
          <div
            key={service.name}
            className={cn(
              'flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm',
              service.selected ? 'border-primary bg-primary/5' : 'border-border'
            )}
          >
            <span className={cn('font-medium', service.selected ? 'text-foreground' : 'text-muted-foreground')}>
              {service.name}
            </span>
            <span className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{service.duration}</span>
              {service.selected && (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-2.5 w-2.5" />
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-primary">{pb.stepDatetime}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {slots.map((slot) => (
          <span
            key={slot}
            className={cn(
              'rounded-md border px-2 py-1.5 text-center text-xs font-medium',
              slot === selectedSlot
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground'
            )}
          >
            {slot}
          </span>
        ))}
      </div>

      <Button className="mt-5 w-full pointer-events-none" size="sm" tabIndex={-1}>
        {pb.confirmBtn}
      </Button>
    </div>
  )
}

export function Showcase() {
  const { t } = useLanguage()
  const l = t.landing

  const bullets = [l.showcaseBullet1, l.showcaseBullet2, l.showcaseBullet3]

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <Reveal className="flex justify-center lg:order-2 lg:justify-end">
          <BookingWidgetMock />
        </Reveal>
        <Reveal className="lg:order-1">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
            {l.showcaseBadge}
          </span>
          <h2 className="mt-5 text-3xl font-bold tracking-tight text-foreground text-balance sm:text-4xl">
            {l.showcaseTitle}
          </h2>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground text-pretty">{l.showcaseSubtitle}</p>
          <ul className="mt-6 space-y-3">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2.5 text-sm text-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {bullet}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  )
}
