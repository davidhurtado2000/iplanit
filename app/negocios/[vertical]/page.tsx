import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, BookOpen } from 'lucide-react'
import { VERTICALS } from '@/lib/verticals'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { LandingHeader } from '@/components/landing/landing-header'
import { LandingFooter } from '@/components/landing/footer'
import { Reveal } from '@/components/landing/reveal'
import { VerticalContent } from '@/components/negocios/vertical-hero'
import { VerticalCta } from '@/components/negocios/vertical-cta'

interface PageProps {
  params: Promise<{ vertical: string }>
}

export function generateStaticParams() {
  return VERTICALS.map((v) => ({ vertical: v.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { vertical } = await params
  const data = VERTICALS.find((v) => v.slug === vertical)
  if (!data) return {}
  return { title: data.metaTitle, description: data.metaDescription }
}

// Part of the regular marketing site (respects the light/dark toggle,
// reuses LandingHeader/LandingFooter) - NOT the blog, which forces dark +
// glassmorphism. Content is bilingual (context/language-context.tsx's
// t.landing.verticals) since it's read server-side here in whichever
// language the request resolves to by default; the client-side toggle
// re-renders it same as any other landing section.
export default async function VerticalPage({ params }: PageProps) {
  const { vertical } = await params
  const data = VERTICALS.find((v) => v.slug === vertical)
  if (!data) notFound()

  const supabase = await createServerSupabaseClient()
  const { data: category } = await supabase.from('blog_categories').select('id, name').eq('slug', vertical).maybeSingle()
  const { data: articles } = category
    ? await supabase
        .from('blog_articles')
        .select('slug, title, meta_description')
        .eq('category_id', category.id)
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(3)
    : { data: null }

  const Icon = data.icon

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
        <Reveal className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-7 w-7" />
          </div>
          <VerticalContent slug={vertical} />
        </Reveal>

        {articles && articles.length > 0 && (
          <Reveal delayMs={100} className="mt-16 border-t pt-10">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <BookOpen className="h-4 w-4" />
              Guías relacionadas
            </div>
            <div className="space-y-3">
              {articles.map((article) => (
                <Link
                  key={article.slug}
                  href={`/blog/${vertical}/${article.slug}`}
                  className="group flex items-center justify-between gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40"
                >
                  <div>
                    <p className="font-medium text-foreground group-hover:text-primary">{article.title}</p>
                    {article.meta_description && (
                      <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{article.meta_description}</p>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                </Link>
              ))}
            </div>
          </Reveal>
        )}

        <Reveal delayMs={150} className="mt-16 rounded-2xl border bg-muted/30 p-8 text-center">
          <VerticalCta />
        </Reveal>
      </main>
      <LandingFooter />
    </div>
  )
}
