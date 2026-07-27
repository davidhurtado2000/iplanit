'use client'

import Link from 'next/link'
import { Calendar } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import type { LegalDocument } from '@/lib/legal-content'

export function LegalPage({ es, en }: { es: LegalDocument; en: LegalDocument }) {
  const { language, setLanguage } = useLanguage()
  const doc = language === 'es' ? es : en

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Calendar className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-foreground">iPlanit</span>
          </Link>
          <div className="inline-flex overflow-hidden rounded-md border text-xs font-medium">
            <button
              type="button"
              onClick={() => setLanguage('es')}
              className={`px-2.5 py-1 ${language === 'es' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
            >
              ES
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`border-l px-2.5 py-1 ${language === 'en' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
            >
              EN
            </button>
          </div>
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
