'use client'

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
        {/* Same treatment as the real AI chat's AssistantAvatar
            (components/dashboard/analytics-ai-chat.tsx) - the icon is
            already a filled circular badge edge-to-edge, so it's rendered
            directly rather than shrunk inside another padded circle. */}
        <img src="/favicon-96x96.png" alt="" className="h-7 w-7 shrink-0 rounded-full" />
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

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <Reveal className="flex justify-center lg:justify-start">
          <AiChatMock />
        </Reveal>
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight text-foreground text-balance sm:text-4xl">
            {l.aiTitle}
          </h2>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground text-pretty">{l.aiSubtitle}</p>
        </Reveal>
      </div>
    </section>
  )
}
