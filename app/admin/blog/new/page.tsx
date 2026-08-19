'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BlogArticleForm } from '@/components/admin/blog-article-form'
import type { BlogCategoryRow } from '@/lib/blog'

export default function NewBlogArticlePage() {
  const supabase = createClient()
  // Generated up front (not on save) so the image-upload storage path is
  // stable before the row exists - same id gets used for the eventual
  // insert.
  const [articleId] = useState(() => crypto.randomUUID())
  const [categories, setCategories] = useState<BlogCategoryRow[]>([])
  const [otherArticles, setOtherArticles] = useState<{ id: string; title: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('blog_categories').select('*').order('sort_order'),
      supabase.from('blog_articles').select('id, title'),
    ]).then(([categoriesRes, articlesRes]) => {
      setCategories(categoriesRes.data || [])
      setOtherArticles(articlesRes.data || [])
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/admin/blog" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Volver al blog
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Nuevo artículo</h1>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <BlogArticleForm articleId={articleId} existingArticle={null} categories={categories} otherArticles={otherArticles} />
        )}
      </div>
    </div>
  )
}
