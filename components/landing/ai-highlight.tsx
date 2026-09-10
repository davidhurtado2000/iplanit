'use client'

import { Check, Sparkles } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { Reveal } from '@/components/landing/reveal'

// Third product visual - same two-column pattern as Showcase (mock +
// text/bullets), but the mock here is a chat exchange instead of a booking
// widget, since that's the actual shape of the feature: type a question,
// get a real answer back. Sits right before Pricing so this is the "here's
// something worth paying for" beat, and Pricing then shows the real price.
function AiChatMock() {
  const { t } = useLanguage()
  const l = t.landing

  return (
    <div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-2xl shadow-primary/10 sm:p-6">
      <div className="flex items-center gap-2 border-b pb-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <span className="text-sm font-semibold text-foreground">{l.aiBadge}</span>
      </div>
      <div className="mt-4 flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-sm text-primary-foreground text-pretty">
          {l.aiMockQuestion}
        </p>
      </div>
      <div className="mt-3 flex justify-start">
        <p className="max-w-[90%] rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2.5 text-sm text-foreground text-pretty">
          {l.aiMockAnswer}
        </p>
      </div>
    </div>
  )
}

export function AiHighlight() {
  const { t } = useLanguage()
  const l = t.landing

  const bullets = [l.aiBullet1, l.aiBullet2, l.aiBullet3]

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <Reveal className="flex justify-center lg:justify-start">
          <AiChatMock />
        </Reveal>
        <Reveal>
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            {l.aiBadge}
          </span>
          <h2 className="mt-5 text-3xl font-bold tracking-tight text-foreground text-balance sm:text-4xl">
            {l.aiTitle}
          </h2>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground text-pretty">{l.aiSubtitle}</p>
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
