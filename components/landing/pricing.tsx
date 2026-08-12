'use client'

import Link from 'next/link'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import { Reveal } from '@/components/landing/reveal'

interface PlanFeature {
  title: string
  desc?: string
}

export function Pricing() {
  const { t } = useLanguage()
  const l = t.landing
  const u = t.upgradeModal

  const plans = [
    {
      name: l.planFreeName,
      price: 0,
      desc: l.planFreeDesc,
      cta: l.planFreeCta,
      href: '/register',
      highlight: false,
      // Free's items are plain numeric limits - self-explanatory on their
      // own, no separate description line needed the way Pro/Premium's
      // feature list does below.
      features: [
        { title: l.planFreeFeature1 },
        { title: l.planFreeFeature2 },
        { title: l.planFreeFeature3 },
        { title: l.planFreeFeature4 },
      ] as PlanFeature[],
    },
    {
      name: l.planProName,
      price: 25,
      desc: l.planProDesc,
      cta: l.planProCta,
      href: '/register',
      highlight: false,
      includesLabel: l.planProIncludesFree,
      // Title + description per feature (not just the bare title upgrade-
      // modal.tsx uses in its own compact card) - a first-time visitor
      // hasn't seen the product yet and needs the "why this matters" line
      // the in-app modal can skip since its audience already knows iPlanit.
      features: [
        { title: u.featureUnlimitedTitle, desc: u.featureUnlimitedDesc },
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
      highlight: true,
      includesLabel: l.planPremiumIncludesPro,
      features: [
        { title: u.featureAnalyticsTitle, desc: u.featureAnalyticsDesc },
        { title: u.featureClientHistoryTitle, desc: u.featureClientHistoryDesc },
        { title: u.featureUnlimitedRecordsTitle, desc: u.featureUnlimitedRecordsDesc },
        { title: u.featureCsvTitle, desc: u.featureCsvDesc },
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
              <div
                className={cn(
                  'relative flex h-full flex-col rounded-2xl border p-7',
                  plan.highlight ? 'border-primary bg-card shadow-xl shadow-primary/10' : 'bg-card'
                )}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                    {l.pricingMostPopular}
                  </span>
                )}
                <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{plan.desc}</p>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight text-foreground">${plan.price}</span>
                  <span className="text-sm text-muted-foreground">{l.pricingPerMonth}</span>
                </div>
                <Button asChild className="mt-6 w-full" variant={plan.highlight ? 'default' : 'outline'}>
                  <Link href={plan.href}>{plan.cta}</Link>
                </Button>
                <ul className="mt-7 space-y-4 text-sm">
                  {plan.includesLabel && (
                    <li className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {plan.includesLabel}
                    </li>
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
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
