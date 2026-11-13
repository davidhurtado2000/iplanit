'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/dashboard/page-header'
import { HelpArticleBadges } from '@/components/help/help-article-view'
import { useLanguage } from '@/context/language-context'
import { HELP_ARTICLES, HELP_CATEGORIES, searchHelp, type HelpArticle } from '@/lib/help/articles'

// Help center (lib/help/articles.ts). Spanish only for now.

function ArticleRow({ article }: { article: HelpArticle }) {
  return (
    <Link
      href={`/dashboard/ayuda/${article.slug}`}
      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-foreground">{article.title}</span>
          <HelpArticleBadges article={article} />
        </div>
        <p className="text-sm text-muted-foreground">{article.summary}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

export default function HelpCenterPage() {
  const { language } = useLanguage()
  const [query, setQuery] = useState('')
  const results = useMemo(() => (query.trim() ? searchHelp(query) : null), [query])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Centro de ayuda"
        subtitle="Guías paso a paso para cada parte de iPlanit."
        search={
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar: propina, boleta, bloquear horario..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
        }
      />

      {language === 'en' && (
        <p className="rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          The help center is in Spanish for now. An English version is coming.
        </p>
      )}

      {results ? (
        results.length === 0 ? (
          <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
            No encontramos nada con "{query.trim()}". Prueba con otra palabra o escríbenos.
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-2">
            {results.map((a) => (
              <ArticleRow key={a.slug} article={a} />
            ))}
          </div>
        )
      ) : (
        <div className="space-y-6">
          {HELP_CATEGORIES.map((cat) => {
            const articles = HELP_ARTICLES.filter((a) => a.category === cat.key)
            if (articles.length === 0) return null
            return (
              <section key={cat.key} className="space-y-2">
                <div className="px-1">
                  <h2 className="font-semibold text-foreground">{cat.title}</h2>
                  <p className="text-sm text-muted-foreground">{cat.description}</p>
                </div>
                <div className="rounded-xl border bg-card p-2">
                  {articles.map((a) => (
                    <ArticleRow key={a.slug} article={a} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
