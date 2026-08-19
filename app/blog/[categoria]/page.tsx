import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { BlogHeader } from '@/components/blog/blog-header'
import { Breadcrumbs } from '@/components/blog/breadcrumbs'
import { ArticleCard } from '@/components/blog/article-card'

interface PageProps {
  params: Promise<{ categoria: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { categoria } = await params
  const supabase = await createServerSupabaseClient()
  const { data: category } = await supabase.from('blog_categories').select('*').eq('slug', categoria).maybeSingle()

  if (!category) return {}
  return {
    title: `${category.name} - Blog iPlanit`,
    description: category.short_description || `Artículos sobre ${category.name.toLowerCase()} en el blog de iPlanit.`,
  }
}

export default async function BlogCategoryPage({ params }: PageProps) {
  const { categoria } = await params
  const supabase = await createServerSupabaseClient()

  const [{ data: category }, { data: categories }] = await Promise.all([
    supabase.from('blog_categories').select('*').eq('slug', categoria).maybeSingle(),
    supabase.from('blog_categories').select('*').order('sort_order'),
  ])

  if (!category) notFound()

  // No .eq('status', 'published') - same RLS-driven admin preview as the
  // index and article pages.
  const { data: articles } = await supabase
    .from('blog_articles')
    .select('*')
    .eq('category_id', category.id)
    .order('published_at', { ascending: false, nullsFirst: false })

  const allCategories = categories || []
  const categoryArticles = articles || []

  return (
    <>
      <BlogHeader categories={allCategories} />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Breadcrumbs items={[{ label: 'Blog', href: '/blog' }, { label: category.name }]} />
        <h1 className="mt-4 text-3xl font-bold text-foreground">{category.name}</h1>
        {category.short_description && <p className="mt-3 max-w-2xl text-muted-foreground">{category.short_description}</p>}

        {categoryArticles.length === 0 ? (
          <p className="mt-12 text-muted-foreground">Todavía no hay artículos en esta categoría.</p>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categoryArticles.map((article) => (
              <ArticleCard key={article.id} article={article} category={category} />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
