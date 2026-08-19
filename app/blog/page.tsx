import type { Metadata } from 'next'
import Link from 'next/link'
import { ImageOff } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { BlogHeader } from '@/components/blog/blog-header'
import { ArticleCard } from '@/components/blog/article-card'
import { VerticalShowcase } from '@/components/blog/vertical-showcase'

export const metadata: Metadata = {
  title: 'Blog - iPlanit',
  description: 'Guías y consejos para negocios de servicios sobre reservas, agenda y gestión de clientes.',
}

export default async function BlogIndexPage() {
  const supabase = await createServerSupabaseClient()

  // No .eq('status', 'published') - RLS returns published-only rows to
  // regular visitors and everything to platform admins (see the same note
  // in app/blog/[categoria]/[slug]/page.tsx). nullsFirst: false keeps any
  // draft (no published_at yet) from jumping to the top of a DESC sort,
  // which is Postgres's default null placement for descending order.
  const [{ data: articles }, { data: categories }] = await Promise.all([
    supabase.from('blog_articles').select('*').order('published_at', { ascending: false, nullsFirst: false }),
    supabase.from('blog_categories').select('*').order('sort_order'),
  ])

  const allArticles = articles || []
  const allCategories = categories || []
  const [featured, ...rest] = allArticles
  // "General" is already the main grid below - the per-vertical showcase
  // rows are for every OTHER category, matching wireframe_blog_iplanit.html.
  const verticalCategories = allCategories.filter((c) => c.slug !== 'general')

  return (
    <>
      <BlogHeader categories={allCategories} />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        {allArticles.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">Todavía no hay artículos publicados.</p>
        ) : (
          <>
            {featured && (
              <Link
                href={`/blog/${allCategories.find((c) => c.id === featured.category_id)?.slug ?? 'general'}/${featured.slug}`}
                className="group grid grid-cols-1 overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-white/20 md:grid-cols-2"
              >
                <div className="flex flex-col justify-center gap-2.5 p-6">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-primary">
                      {allCategories.find((c) => c.id === featured.category_id)?.name}
                    </span>
                    {featured.status === 'draft' && (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                        Borrador
                      </span>
                    )}
                  </div>
                  <h1 className="text-xl font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
                    {featured.title}
                  </h1>
                  <p className="text-sm text-muted-foreground">{featured.meta_description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{featured.reading_time_minutes ?? 5} min de lectura</p>
                </div>
                <div className="flex min-h-[180px] items-center justify-center border-t border-white/10 bg-white/5 md:border-l md:border-t-0">
                  {featured.featured_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={featured.featured_image_url}
                      alt={featured.featured_image_alt || ''}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <ImageOff className="h-8 w-8 text-muted-foreground/40" />
                  )}
                </div>
              </Link>
            )}

            {rest.length > 0 && (
              <section>
                <p className="text-xs tracking-wide text-muted-foreground">últimos artículos</p>
                <h2 className="mb-4 mt-1 text-lg font-medium text-foreground">Todos los artículos</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {rest.map((article) => (
                    <ArticleCard
                      key={article.id}
                      article={article}
                      category={allCategories.find((c) => c.id === article.category_id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {verticalCategories.map((category) => (
              <VerticalShowcase
                key={category.id}
                category={category}
                articles={allArticles.filter((a) => a.category_id === category.id)}
              />
            ))}
          </>
        )}
      </main>
    </>
  )
}
