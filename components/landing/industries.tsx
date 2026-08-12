'use client'

import {
  Building2,
  Stethoscope,
  Activity,
  PawPrint,
  Sparkles,
  Scissors,
  Dumbbell,
  UtensilsCrossed,
  GraduationCap,
  Camera,
  PartyPopper,
  Briefcase,
  User,
  MoreHorizontal,
} from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { Reveal } from '@/components/landing/reveal'

// Same 14 categories as the real onboarding business-type picker
// (context/language-context.tsx auth.register.businessTypes) - reused
// verbatim rather than a new list, so this section shows real product
// scope instead of an invented one.
const INDUSTRY_ICONS = [
  { key: 'coworking' as const, icon: Building2 },
  { key: 'clinic' as const, icon: Stethoscope },
  { key: 'dental' as const, icon: Activity },
  { key: 'veterinary' as const, icon: PawPrint },
  { key: 'spa' as const, icon: Sparkles },
  { key: 'salon' as const, icon: Scissors },
  { key: 'gym' as const, icon: Dumbbell },
  { key: 'restaurant' as const, icon: UtensilsCrossed },
  { key: 'education' as const, icon: GraduationCap },
  { key: 'photography' as const, icon: Camera },
  { key: 'events' as const, icon: PartyPopper },
  { key: 'consulting' as const, icon: Briefcase },
  { key: 'professional' as const, icon: User },
  { key: 'other' as const, icon: MoreHorizontal },
]

export function Industries() {
  const { t } = useLanguage()
  const l = t.landing
  const businessTypes = t.auth.register.businessTypes

  return (
    <section id="para-tu-negocio" className="border-t bg-muted/30 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{l.industriesTitle}</h2>
          <p className="mt-4 text-lg text-muted-foreground">{l.industriesSubtitle}</p>
        </Reveal>

        <Reveal delayMs={100} className="mt-12 flex flex-wrap justify-center gap-3">
          {INDUSTRY_ICONS.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="flex items-center gap-2 rounded-full border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <Icon className="h-4 w-4 shrink-0 text-primary" />
              {businessTypes[key]}
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  )
}
