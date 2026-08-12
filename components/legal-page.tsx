'use client'

import Link from 'next/link'
import { useLanguage } from '@/context/language-context'
import { LanguageToggle } from '@/components/language-toggle'
import type { LegalDocument } from '@/lib/legal-content'

export function LegalPage({ es, en }: { es: LegalDocument; en: LegalDocument }) {
  const { language } = useLanguage()
  const doc = language === 'es' ? es : en

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/favicon-96x96.png" alt="" className="h-8 w-8 shrink-0 dark:hidden" />
            <img src="/favicon-96x96-white.png" alt="" className="hidden h-8 w-8 shrink-0 dark:block" />
            <img src="/logotipo_modolight.png" alt="iPlanit" className="h-6 w-auto dark:hidden" />
            <img src="/logotipo_mododark.png" alt="iPlanit" className="hidden h-6 w-auto dark:block" />
          </Link>
          <LanguageToggle className="mb-0 w-auto justify-start" />
        </div>

        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{doc.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{doc.lastUpdated}</p>

        <div className="mt-8 space-y-8">
          {doc.sections.map((section, i) => (
            <section key={i}>
              <h2 className="text-lg font-semibold text-foreground">{section.heading}</h2>
              <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">
                {section.body.map((paragraph, j) => (
                  <p key={j}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
