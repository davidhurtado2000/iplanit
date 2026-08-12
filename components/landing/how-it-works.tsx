'use client'

import { Building2, Link2, CalendarCheck } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { Reveal } from '@/components/landing/reveal'

export function HowItWorks() {
  const { t } = useLanguage()
  const l = t.landing

  const steps = [
    { icon: Building2, title: l.step1Title, desc: l.step1Desc },
    { icon: Link2, title: l.step2Title, desc: l.step2Desc },
    { icon: CalendarCheck, title: l.step3Title, desc: l.step3Desc },
  ]

  return (
    <section id="como-funciona" className="border-t bg-muted/30 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{l.howItWorksTitle}</h2>
          <p className="mt-4 text-lg text-muted-foreground">{l.howItWorksSubtitle}</p>
        </Reveal>

        <div className="relative mt-16 grid gap-10 sm:grid-cols-3 sm:gap-6">
          <div className="pointer-events-none absolute top-7 left-0 right-0 hidden h-px bg-border sm:block" />
          {steps.map((step, i) => (
            <Reveal key={step.title} delayMs={i * 120} className="relative flex flex-col items-center text-center">
              <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full border-4 border-muted/30 bg-primary text-primary-foreground">
                <step.icon className="h-6 w-6" />
              </div>
              <span className="mt-4 text-xs font-semibold uppercase tracking-wide text-primary">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-1.5 text-lg font-semibold text-foreground">{step.title}</h3>
              <p className="mt-2 max-w-xs text-sm text-muted-foreground">{step.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
