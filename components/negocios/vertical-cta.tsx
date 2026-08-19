'use client'

import Link from 'next/link'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'

// Reuses the same closing-CTA copy as components/landing/final-cta.tsx
// rather than writing yet another variant - same offer, same wording,
// consistent across the site.
export function VerticalCta() {
  const { t } = useLanguage()
  const l = t.landing

  return (
    <>
      <h2 className="text-xl font-bold text-foreground sm:text-2xl">{l.finalCtaTitle}</h2>
      <p className="mt-2 text-muted-foreground">{l.finalCtaSubtitle}</p>
      <Button asChild size="lg" className="mt-6 gap-2">
        <Link href="/register">{l.finalCtaButton}</Link>
      </Button>
    </>
  )
}
