'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BlogArticleForm } from '@/components/admin/blog-article-form'
import type { BlogArticleRow, BlogCategoryRow } from '@/lib/blog'

export default function EditBlogArticlePage() {
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()
  const [article, setArticle] = useState<BlogArticleRow | null>(null)
  const [categories, setCategories] = useState<BlogCategoryRow[]>([])
  const [otherArticles, setOtherArticles] = useState<{ id: string; title: string }[]>([])
  const [sibling, setSibling] = useState<{ id: string; language: 'es' | 'en'; title: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    // Reset to the loading state on every id change, not just on first
    // mount - navigating from one article straight to another (e.g. the
    // "Ver versión en..." link) keeps this same page component mounted, so
    // without this the old article's form stayed on screen, fully
    // interactive, while the new one loaded silently underneath it.
    setLoading(true)
    supabase
      .from('blog_articles')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(async (articleRes) => {
        if (cancelled) return
        if (!articleRes.data) {
          setNotFound(true)
          setLoading(false)
          return
        }
        const loadedArticle = articleRes.data
        const [categoriesRes, articlesRes, siblingRes] = await Promise.all([
          supabase.from('blog_categories').select('*').order('sort_order'),
          supabase.from('blog_articles').select('id, title').neq('id', id),
          // Any status, not just published - the CMS jump-to-translation
          // link should work even while the sibling is still a draft.
          supabase
            .from('blog_articles')
            .select('id, language, title')
            .eq('translation_group_id', loadedArticle.translation_group_id)
            .neq('id', id)
            .maybeSingle(),
        ])
        if (cancelled) return
        setArticle(loadedArticle)
        setCategories(categoriesRes.data || [])
        setOtherArticles(articlesRes.data || [])
        setSibling(siblingRes.data)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/admin/blog" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Volver al blog
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Editar artículo</h1>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : notFound || !article ? (
          <p className="text-sm text-muted-foreground">No se encontró este artículo.</p>
        ) : (
          <BlogArticleForm
            key={id}
            articleId={id}
            existingArticle={article}
            categories={categories}
            otherArticles={otherArticles}
            sibling={sibling}
          />
        )}
      </div>
    </div>
  )
}
