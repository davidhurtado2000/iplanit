'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { HelpArticleView, HelpText } from '@/components/help/help-article-view'
import { HELP_CATEGORIES, helpArticle } from '@/lib/help/articles'

export default function HelpArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const article = helpArticle(slug)

  if (!article) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-12 text-center">
        <p className="text-muted-foreground">No encontramos este artículo.</p>
        <Link href="/dashboard/ayuda" className="text-sm text-primary hover:underline">
          Volver al centro de ayuda
        </Link>
      </div>
    )
  }

  const category = HELP_CATEGORIES.find((c) => c.key === article.category)
  const related = (article.related ?? []).map(helpArticle).filter((a) => a !== undefined)

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link
        href="/dashboard/ayuda"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Centro de ayuda{category ? ` · ${category.title}` : ''}
      </Link>

      {/* A worker-portal article's button would send the owner to a
          /mi-agenda they have no link to - read-only here. */}
      <HelpArticleView article={article} showLink={article.audience === 'business'} />

      {related.length > 0 && (
        <section className="space-y-2 border-t pt-6">
          <h2 className="text-sm font-semibold text-foreground">Artículos relacionados</h2>
          <div className="rounded-xl border bg-card p-2">
            {related.map((a) => (
              <Link
                key={a.slug}
                href={`/dashboard/ayuda/${a.slug}`}
                className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{a.title}</p>
                  <p className="text-sm text-muted-foreground">{a.summary}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <p className="text-sm text-muted-foreground">
        <HelpText text="¿No encontraste lo que buscabas? Escríbenos con el botón **Enviar feedback** y te ayudamos." />
      </p>
    </div>
  )
}
