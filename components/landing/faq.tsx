'use client'

import { useLanguage } from '@/context/language-context'
import { Reveal } from '@/components/landing/reveal'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

// 8 real questions/answers, grounded in the actual product (pricing,
// features, sedes) - not just for visitors, this doubles as the visible
// half of the FAQPage JSON-LD in app/page.tsx (search engines use it for
// featured snippets, and it's exactly the clear Q&A format generative
// engines favor when citing a source).
const FAQ_KEYS = [1, 2, 3, 4, 5, 6, 7, 8] as const

export function Faq() {
  const { t } = useLanguage()
  const l = t.landing

  return (
    <section id="faq" className="border-t bg-muted/30 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Reveal className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{l.faqTitle}</h2>
          <p className="mt-4 text-lg text-muted-foreground">{l.faqSubtitle}</p>
        </Reveal>

        <Reveal delayMs={100} className="mt-10">
          <Accordion type="single" collapsible className="rounded-xl border bg-card px-5 sm:px-6">
            {FAQ_KEYS.map((n) => (
              <AccordionItem key={n} value={`faq-${n}`}>
                <AccordionTrigger className="text-base font-semibold">
                  {l[`faqQ${n}` as keyof typeof l]}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {l[`faqA${n}` as keyof typeof l]}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  )
}
