'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/language-context'
import { Reveal } from '@/components/landing/reveal'

export function FinalCta() {
  const { t } = useLanguage()
  const l = t.landing

  return (
    <section className="border-t bg-muted/30 py-20 sm:py-28">
      <Reveal className="mx-auto max-w-2xl px-4 text-center sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight text-foreground text-balance sm:text-4xl">
          {l.finalCtaTitle}
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">{l.finalCtaSubtitle}</p>
        <Button asChild size="lg" className="mt-8 gap-2">
          <Link href="/register">
            {l.finalCtaButton}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </Reveal>
    </section>
  )
}
