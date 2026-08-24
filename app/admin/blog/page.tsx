'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, FileText, Loader2, Search, Languages } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { BlogArticleRow, BlogCategoryRow } from '@/lib/blog'

type StatusFilter = 'all' | 'draft' | 'published'
type TranslationFilter = 'all' | 'complete' | 'missing'
type SortOption = 'updated' | 'title' | 'published'

// One list row per piece of content, not per DB row - an ES/EN pair is the
// same article to a reader of this list, so they're grouped by
// translation_group_id instead of showing as two unrelated cards that could
// end up far apart once sorted (real feedback: they got lost trying to tell
// which draft belonged to which published article as the list grew).
interface ArticleGroup {
  groupId: string
  primary: BlogArticleRow
  es: BlogArticleRow | null
  en: BlogArticleRow | null
  latestUpdatedAt: string
  latestPublishedAt: string | null
}

export default function AdminBlogListPage() {
  const supabase = createClient()
  const [articles, setArticles] = useState<BlogArticleRow[]>([])
  const [categories, setCategories] = useState<BlogCategoryRow[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [translationFilter, setTranslationFilter] = useState<TranslationFilter>('all')
  const [sortBy, setSortBy] = useState<SortOption>('updated')

  useEffect(() => {
    Promise.all([
      supabase.from('blog_articles').select('*').order('updated_at', { ascending: false }),
      supabase.from('blog_categories').select('*').order('sort_order'),
    ]).then(([articlesRes, categoriesRes]) => {
      setArticles(articlesRes.data || [])
      setCategories(categoriesRes.data || [])
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name || '—'

  const groups = useMemo<ArticleGroup[]>(() => {
    const byGroup = new Map<string, BlogArticleRow[]>()
    for (const a of articles) {
      const list = byGroup.get(a.translation_group_id) || []
      list.push(a)
      byGroup.set(a.translation_group_id, list)
    }
    return [...byGroup.entries()].map(([groupId, members]) => {
      const es = members.find((m) => m.language === 'es') || null
      const en = members.find((m) => m.language === 'en') || null
      return {
        groupId,
        primary: es || en || members[0],
        es,
        en,
        latestUpdatedAt: members.map((m) => m.updated_at).sort().at(-1) || '',
        latestPublishedAt: members.map((m) => m.published_at).filter((d): d is string => !!d).sort().at(-1) || null,
      }
    })
  }, [articles])

  const draftCount = groups.filter((g) => g.es?.status === 'draft' || g.en?.status === 'draft').length
  const publishedCount = groups.filter((g) => g.es?.status === 'published' || g.en?.status === 'published').length

  const visibleGroups = useMemo(() => {
    let result = groups
    if (statusFilter !== 'all') {
      result = result.filter((g) => g.es?.status === statusFilter || g.en?.status === statusFilter)
    }
    if (categoryFilter !== 'all') result = result.filter((g) => g.primary.category_id === categoryFilter)
    if (translationFilter === 'complete') result = result.filter((g) => g.es && g.en)
    if (translationFilter === 'missing') result = result.filter((g) => !g.es || !g.en)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((g) =>
        [g.es, g.en].some((a) => a && (a.title.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q)))
      )
    }

    const sorted = [...result]
    if (sortBy === 'title') sorted.sort((a, b) => a.primary.title.localeCompare(b.primary.title))
    else if (sortBy === 'published')
      sorted.sort((a, b) => (b.latestPublishedAt || '').localeCompare(a.latestPublishedAt || ''))
    else sorted.sort((a, b) => b.latestUpdatedAt.localeCompare(a.latestUpdatedAt))
    return sorted
  }, [groups, statusFilter, categoryFilter, translationFilter, search, sortBy])

  const STATUS_TABS: { value: StatusFilter; label: string; count: number }[] = [
    { value: 'all', label: 'Todos', count: groups.length },
    { value: 'published', label: 'Publicados', count: publishedCount },
    { value: 'draft', label: 'Borradores', count: draftCount },
  ]

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Blog</h1>
            <p className="text-sm text-muted-foreground">Artículos del blog de iPlanit</p>
          </div>
          <Button asChild className="gap-2">
            <Link href="/admin/blog/new">
              <Plus className="h-4 w-4" />
              Nuevo artículo
            </Link>
          </Button>
        </div>

        {!loading && groups.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setStatusFilter(tab.value)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    statusFilter === tab.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por título o slug..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="sm:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={translationFilter} onValueChange={(v) => setTranslationFilter(v as TranslationFilter)}>
                <SelectTrigger className="sm:w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ES + EN</SelectItem>
                  <SelectItem value="complete">Traducción completa</SelectItem>
                  <SelectItem value="missing">Falta traducir</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="sm:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updated">Última actualización</SelectItem>
                  <SelectItem value="published">Fecha de publicación</SelectItem>
                  <SelectItem value="title">Título (A-Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Todavía no hay artículos.</p>
          </div>
        ) : visibleGroups.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Ningún artículo coincide con estos filtros.
          </p>
        ) : (
          <div className="space-y-2">
            {visibleGroups.map((group) => (
              <Card key={group.groupId}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{group.primary.title || 'Sin título'}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {categoryName(group.primary.category_id)} · {group.primary.slug}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <LanguageChip article={group.es} language="es" fallbackId={group.en?.id} />
                    <LanguageChip article={group.en} language="en" fallbackId={group.es?.id} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// One chip per language, always both shown (even when missing) so the pair
// stays visually anchored to the same row - a solid badge for published, an
// outline badge for draft, and a dashed prompt that jumps to the sibling's
// edit page (where the "Crear traducción" banner lives) when this language
// doesn't exist yet.
function LanguageChip({
  article,
  language,
  fallbackId,
}: {
  article: BlogArticleRow | null
  language: 'es' | 'en'
  fallbackId?: string
}) {
  const label = language.toUpperCase()

  if (!article) {
    const chip = (
      <span className="inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-[10px] font-medium text-muted-foreground/60">
        <Languages className="h-3 w-3" />
        {label}
      </span>
    )
    return fallbackId ? <Link href={`/admin/blog/${fallbackId}`}>{chip}</Link> : chip
  }

  return (
    <Badge asChild variant={article.status === 'published' ? 'default' : 'outline'}>
      <Link href={`/admin/blog/${article.id}`}>
        {label} · {article.status === 'published' ? 'Publicado' : 'Borrador'}
      </Link>
    </Badge>
  )
}
