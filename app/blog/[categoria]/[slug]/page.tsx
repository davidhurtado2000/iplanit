import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getRelatedArticles, ogImageFor, parseFaq } from '@/lib/blog'
import { BlogHeader } from '@/components/blog/blog-header'
import { Breadcrumbs } from '@/components/blog/breadcrumbs'
import { RelatedArticles } from '@/components/blog/related-articles'

interface PageProps {
  params: Promise<{ categoria: string; slug: string }>
}

async function loadArticle(categoria: string, slug: string) {
  const supabase = await createServerSupabaseClient()
  // No .eq('status', 'published') here on purpose - RLS (scripts/065-blog.sql)
  // already returns only published rows to anonymous/non-admin visitors and
  // everything (including drafts) to platform admins, so this naturally
  // previews unpublished articles for admins without any extra role check
  // in application code.
  const { data: article } = await supabase.from('blog_articles').select('*').eq('slug', slug).maybeSingle()

  if (!article) return null

  const { data: category } = await supabase.from('blog_categories').select('*').eq('id', article.category_id).maybeSingle()
  if (!category || category.slug !== categoria) return null

  return { article, category }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { categoria, slug } = await params
  const loaded = await loadArticle(categoria, slug)
  if (!loaded) return {}
  const { article } = loaded
  const image = ogImageFor(article)

  return {
    title: article.meta_title,
    description: article.meta_description,
    openGraph: {
      title: article.meta_title,
      description: article.meta_description,
      type: 'article',
      images: image ? [image] : undefined,
    },
  }
}

export default async function BlogArticlePage({ params }: PageProps) {
  const { categoria, slug } = await params
  const loaded = await loadArticle(categoria, slug)
  if (!loaded) notFound()
  const { article, category } = loaded

  const supabase = await createServerSupabaseClient()
  const [{ data: allPublished }, { data: categories }] = await Promise.all([
    supabase.from('blog_articles').select('*').eq('status', 'published'),
    supabase.from('blog_categories').select('*').order('sort_order'),
  ])

  const allCategories = categories || []
  const related = getRelatedArticles(article, allPublished || [], allCategories)
  const faqEntries = parseFaq(article.faq)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: article.title,
        datePublished: article.published_at,
        dateModified: article.updated_at,
        author: { '@type': 'Organization', name: article.author },
        image: ogImageFor(article) ? [ogImageFor(article)] : undefined,
        publisher: { '@id': 'https://iplanit.io/#organization' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://iplanit.io/' },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://iplanit.io/blog' },
          { '@type': 'ListItem', position: 3, name: category.name, item: `https://iplanit.io/blog/${category.slug}` },
          {
            '@type': 'ListItem',
            position: 4,
            name: article.title,
            item: `https://iplanit.io/blog/${category.slug}/${article.slug}`,
          },
        ],
      },
      ...(faqEntries.length > 0
        ? [
            {
              '@type': 'FAQPage',
              mainEntity: faqEntries.map((entry) => ({
                '@type': 'Question',
                name: entry.question,
                acceptedAnswer: { '@type': 'Answer', text: entry.answer },
              })),
            },
          ]
        : []),
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BlogHeader categories={allCategories} />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Breadcrumbs
          items={[
            { label: 'Blog', href: '/blog' },
            { label: category.name, href: `/blog/${category.slug}` },
            { label: article.title },
          ]}
        />
        {article.status === 'draft' && (
          <div className="mt-4 inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
            Borrador — solo visible para admins
          </div>
        )}
        <h1 className="mt-4 text-3xl font-bold text-foreground sm:text-4xl">{article.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {article.author} · {article.reading_time_minutes ?? 5} min de lectura
        </p>

        {article.featured_image_url && (
          <div className="mt-8 overflow-hidden rounded-2xl border border-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={article.featured_image_url} alt={article.featured_image_alt || ''} className="w-full object-cover" />
          </div>
        )}

        <div className="prose prose-invert mt-10 max-w-none prose-headings:font-bold prose-a:text-primary">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.content}</ReactMarkdown>
        </div>

        {faqEntries.length > 0 && (
          <section className="mt-14 border-t border-white/10 pt-10">
            <h2 className="text-xl font-bold text-foreground">Preguntas frecuentes</h2>
            <div className="mt-6 space-y-4">
              {faqEntries.map((entry, i) => (
                <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
                  <p className="font-semibold text-foreground">{entry.question}</p>
                  <p className="mt-1.5 text-sm text-muted-foreground">{entry.answer}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <RelatedArticles articles={related} categories={allCategories} />
      </main>
    </>
  )
}
