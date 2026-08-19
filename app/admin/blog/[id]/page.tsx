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
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('blog_articles').select('*').eq('id', id).maybeSingle(),
      supabase.from('blog_categories').select('*').order('sort_order'),
      supabase.from('blog_articles').select('id, title').neq('id', id),
    ]).then(([articleRes, categoriesRes, articlesRes]) => {
      if (!articleRes.data) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setArticle(articleRes.data)
      setCategories(categoriesRes.data || [])
      setOtherArticles(articlesRes.data || [])
      setLoading(false)
    })
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
          <BlogArticleForm articleId={id} existingArticle={article} categories={categories} otherArticles={otherArticles} />
        )}
      </div>
    </div>
  )
}
