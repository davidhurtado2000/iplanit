'use client'

import Link from 'next/link'
import { Check, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import { Reveal } from '@/components/landing/reveal'

interface PlanFeature {
  title: string
  desc?: string
}

// Card redesign, chosen from a 3-way comparison (see the "Premium Card
// Concepts" artifact from 2026-09-21): every plan is a color band
// (name/desc/price/CTA) over a plain body (features), same shape for
// all three, only the band's color differs - matches upgrade-modal.tsx's
// in-app cards so the visual language is the same whether someone's
// looking at pricing here or inside the app.
type Band = 'muted' | 'primary' | 'ink'

export function Pricing() {
  const { t } = useLanguage()
  const l = t.landing
  const u = t.upgradeModal

  const plans = [
    {
      name: l.planBasicName,
      price: 15,
      desc: l.planBasicDesc,
      cta: l.planBasicCta,
      href: '/register',
      band: 'muted' as Band,
      // Basic's items are plain numeric limits - self-explanatory on their
      // own, no separate description line needed the way Pro/Premium's
      // feature list does below.
      features: [
        { title: l.planBasicFeature1 },
        { title: l.planBasicFeature2 },
        { title: l.planBasicFeature3 },
        { title: l.planBasicFeature4 },
      ] as PlanFeature[],
    },
    {
      name: l.planProName,
      price: 25,
      desc: l.planProDesc,
      cta: l.planProCta,
      href: '/register',
      band: 'primary' as Band,
      mostPopular: true,
      hasAiAddon: true,
      includesLabel: l.planProIncludesFree,
      // Title + description per feature (not just the bare title upgrade-
      // modal.tsx uses in its own compact card) - a first-time visitor
      // hasn't seen the product yet and needs the "why this matters" line
      // the in-app modal can skip since its audience already knows iPlanit.
      features: [
        { title: u.featureUnlimitedTitle, desc: u.featureUnlimitedDesc },
        { title: u.featureAnalyticsTitle, desc: u.featureAnalyticsDesc },
        { title: u.featureProCapTitle, desc: u.featureProCapDesc },
        { title: u.featureProSeatsTitle, desc: u.featureProSeatsDesc },
        { title: u.featureProRecurringTitle, desc: u.featureProRecurringDesc },
      ] as PlanFeature[],
    },
    {
      name: l.planPremiumName,
      price: 40,
      desc: l.planPremiumDesc,
      cta: l.planPremiumCta,
      href: '/register',
      band: 'ink' as Band,
      hasAiAddon: true,
      includesLabel: l.planPremiumIncludesPro,
      features: [
        { title: u.featureUnlimitedReservationsTitle, desc: u.featureUnlimitedReservationsDesc },
        { title: u.featureUnlimitedServicesTitle, desc: u.featureUnlimitedServicesDesc },
        { title: u.featureUnlimitedRecordsTitle, desc: u.featureUnlimitedRecordsDesc },
        { title: u.featureSedesTitle, desc: u.featureSedesDesc },
        { title: u.featurePremiumReportsTitle, desc: u.featurePremiumReportsDesc },
        { title: u.featureCsvTitle, desc: u.featureCsvDesc },
        { title: u.featureParkingTitle, desc: u.featureParkingDesc },
        { title: u.featurePrioritySupportTitle, desc: u.featurePrioritySupportDesc },
      ] as PlanFeature[],
    },
  ]

  return (
    <section id="planes" className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{l.pricingTitle}</h2>
          <p className="mt-4 text-lg text-muted-foreground">{l.pricingSubtitle}</p>
        </Reveal>

        <div className="mt-16 grid gap-6 lg:grid-cols-3 lg:items-start">
          {plans.map((plan, i) => (
            <Reveal key={plan.name} delayMs={i * 100}>
              {/* Badge lives in an outer wrapper without overflow-hidden -
                  the card below needs overflow-hidden so the band's top
                  corners stay clipped to rounded-2xl, but that same
                  overflow-hidden was clipping this badge's "-top-3" (it
                  sits half outside the card on purpose) - found live
                  2026-09-21, "Mas popular" was rendering cut off. */}
              <div className="relative h-full">
                {plan.mostPopular && (
                  <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                    {l.pricingMostPopular}
                  </span>
                )}
                <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg">
                <div
                  className={cn(
                    'px-7 pt-8 pb-7',
                    plan.band === 'ink' && 'bg-neutral-950 dark:bg-neutral-900',
                    plan.band === 'primary' && 'bg-primary',
                    plan.band === 'muted' && 'bg-muted'
                  )}
                >
                  <h3 className={cn('text-lg font-semibold', plan.band === 'muted' ? 'text-foreground' : 'text-white')}>
                    {plan.name}
                  </h3>
                  <p className={cn('mt-1 text-sm', plan.band === 'muted' ? 'text-muted-foreground' : 'text-white/70')}>
                    {plan.desc}
                  </p>
                  <div className="mt-5 flex items-baseline gap-1">
                    <span
                      className={cn(
                        'font-mono text-4xl font-bold tracking-tight tabular-nums',
                        plan.band === 'muted' ? 'text-foreground' : 'text-white'
                      )}
                    >
                      ${plan.price}
                    </span>
                    <span className={cn('text-sm', plan.band === 'muted' ? 'text-muted-foreground' : 'text-white/70')}>
                      {l.pricingPerMonth}
                    </span>
                  </div>
                  <Button
                    asChild
                    className={cn(
                      'mt-6 w-full active:scale-[0.97]',
                      plan.band !== 'muted' && 'bg-white text-neutral-900 hover:bg-neutral-200'
                    )}
                    variant={plan.band === 'muted' ? 'outline' : 'default'}
                  >
                    <Link href={plan.href}>{plan.cta}</Link>
                  </Button>
                </div>
                <div className="flex flex-1 flex-col bg-card px-7 pt-7 pb-7">
                  <ul className="space-y-4 text-sm">
                    {plan.includesLabel && (
                      <li className="text-xs font-semibold text-foreground">{plan.includesLabel}</li>
                    )}
                    {plan.features.map((feature) => (
                      <li key={feature.title} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>
                          <span className="block font-medium text-foreground">{feature.title}</span>
                          {feature.desc && (
                            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{feature.desc}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {plan.hasAiAddon && (
                    <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="text-xs leading-snug">
                        <span className="block font-medium text-foreground">{l.planAiAddonTitle}</span>
                        <span className="mt-0.5 block text-muted-foreground">{l.planAiAddonDesc}</span>
                      </span>
                    </div>
                  )}
                </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
