import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { BlogHeader } from '@/components/blog/blog-header'
import { Breadcrumbs } from '@/components/blog/breadcrumbs'
import { ArticleCard } from '@/components/blog/article-card'
import { blogT, categoryDescription, categoryName, resolveBlogLanguage } from '@/lib/blog-i18n'

interface PageProps {
  params: Promise<{ categoria: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { categoria } = await params
  const supabase = await createServerSupabaseClient()
  const language = await resolveBlogLanguage()
  const t = blogT(language)
  const { data: category } = await supabase.from('blog_categories').select('*').eq('slug', categoria).maybeSingle()

  if (!category) return {}
  const name = categoryName(category, language)
  return {
    title: `${name} - ${t.blogLabel} iPlanit`,
    description: categoryDescription(category, language) || t.categoryDescriptionFallback(name),
  }
}

export default async function BlogCategoryPage({ params }: PageProps) {
  const { categoria } = await params
  const supabase = await createServerSupabaseClient()
  const language = await resolveBlogLanguage()
  const t = blogT(language)

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
    .eq('language', language)
    .order('published_at', { ascending: false, nullsFirst: false })

  const allCategories = categories || []
  const categoryArticles = articles || []
  const name = categoryName(category, language)
  const description = categoryDescription(category, language)

  return (
    <>
      <BlogHeader
        categories={allCategories}
        language={language}
        translationLinks={{ es: `/blog/${categoria}`, en: `/blog/${categoria}` }}
      />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Breadcrumbs items={[{ label: t.blogLabel, href: '/blog' }, { label: name }]} />
        <h1 className="mt-4 text-3xl font-bold text-foreground">{name}</h1>
        {description && <p className="mt-3 max-w-2xl text-muted-foreground">{description}</p>}

        {categoryArticles.length === 0 ? (
          <p className="mt-12 text-muted-foreground">{t.noCategoryArticles}</p>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categoryArticles.map((article) => (
              <ArticleCard key={article.id} article={article} category={category} language={language} />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
