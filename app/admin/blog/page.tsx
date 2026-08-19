'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, FileText, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { BlogArticleRow, BlogCategoryRow } from '@/lib/blog'

type StatusFilter = 'all' | 'draft' | 'published'
type SortOption = 'updated' | 'title' | 'published'

export default function AdminBlogListPage() {
  const supabase = createClient()
  const [articles, setArticles] = useState<BlogArticleRow[]>([])
  const [categories, setCategories] = useState<BlogCategoryRow[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
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

  const draftCount = articles.filter((a) => a.status === 'draft').length
  const publishedCount = articles.filter((a) => a.status === 'published').length

  const visibleArticles = useMemo(() => {
    let result = articles
    if (statusFilter !== 'all') result = result.filter((a) => a.status === statusFilter)
    if (categoryFilter !== 'all') result = result.filter((a) => a.category_id === categoryFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((a) => a.title.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q))
    }

    const sorted = [...result]
    if (sortBy === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title))
    else if (sortBy === 'published') sorted.sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''))
    else sorted.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    return sorted
  }, [articles, statusFilter, categoryFilter, search, sortBy])

  const STATUS_TABS: { value: StatusFilter; label: string; count: number }[] = [
    { value: 'all', label: 'Todos', count: articles.length },
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

        {!loading && articles.length > 0 && (
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
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Todavía no hay artículos.</p>
          </div>
        ) : visibleArticles.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Ningún artículo coincide con estos filtros.
          </p>
        ) : (
          <div className="space-y-2">
            {visibleArticles.map((article) => (
              <Link key={article.id} href={`/admin/blog/${article.id}`}>
                <Card className="cursor-pointer transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{article.title || 'Sin título'}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {categoryName(article.category_id)} · {article.slug}
                      </p>
                    </div>
                    <Badge variant={article.status === 'published' ? 'default' : 'outline'} className="shrink-0">
                      {article.status === 'published' ? 'Publicado' : 'Borrador'}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
