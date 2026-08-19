'use client'

import { useLanguage } from '@/context/language-context'

export function VerticalContent({ slug }: { slug: string }) {
  const { t } = useLanguage()
  const data = t.landing.verticals[slug as keyof typeof t.landing.verticals]
  if (!data) return null

  return (
    <>
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{data.h1}</h1>
      <p className="mt-4 text-lg text-muted-foreground">{data.subtitle}</p>
      <div className="mt-10 space-y-5 text-left">
        {data.paragraphs.map((paragraph, i) => (
          <p key={i} className="text-base leading-relaxed text-foreground/90">
            {paragraph}
          </p>
        ))}
      </div>
    </>
  )
}
