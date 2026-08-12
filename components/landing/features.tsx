'use client'

import { CalendarDays, Link2, Users, UserCog, BarChart3, Bell } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { Reveal } from '@/components/landing/reveal'

export function Features() {
  const { t } = useLanguage()
  const l = t.landing

  const features = [
    { icon: CalendarDays, title: l.featureCalendarTitle, desc: l.featureCalendarDesc },
    { icon: Link2, title: l.featureBookingTitle, desc: l.featureBookingDesc },
    { icon: Users, title: l.featureClientsTitle, desc: l.featureClientsDesc },
    { icon: UserCog, title: l.featureTeamTitle, desc: l.featureTeamDesc },
    { icon: BarChart3, title: l.featureReportsTitle, desc: l.featureReportsDesc },
    { icon: Bell, title: l.featureNotificationsTitle, desc: l.featureNotificationsDesc },
  ]

  return (
    <section id="funciones" className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{l.featuresTitle}</h2>
          <p className="mt-4 text-lg text-muted-foreground">{l.featuresSubtitle}</p>
        </Reveal>

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <Reveal key={feature.title} delayMs={(i % 3) * 90}>
              <div className="group h-full rounded-xl border bg-card p-6 transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
