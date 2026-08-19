import type { MetadataRoute } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// Only the pages meant for organic discovery - /dashboard, /login,
// /register, etc. are functional/gated pages nobody finds via search, and
// per-business /reservar/[slug] pages are customer-specific rather than
// content Google should rank (see app/robots.ts, which disallows them).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://iplanit.io'

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ]

  const supabase = await createServerSupabaseClient()
  const [{ data: categories }, { data: articles }] = await Promise.all([
    supabase.from('blog_categories').select('slug'),
    supabase.from('blog_articles').select('slug, updated_at, category_id, blog_categories(slug)').eq('status', 'published'),
  ])

  const categoryRoutes: MetadataRoute.Sitemap = (categories || []).map((c) => ({
    url: `${baseUrl}/blog/${c.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  // /negocios/[vertical] - one per blog category except "general" (same
  // query result as categoryRoutes above, so this list can never drift out
  // of sync with the categories that actually exist - see lib/verticals.ts).
  const verticalRoutes: MetadataRoute.Sitemap = (categories || [])
    .filter((c) => c.slug !== 'general')
    .map((c) => ({
      url: `${baseUrl}/negocios/${c.slug}`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    }))

  const articleRoutes: MetadataRoute.Sitemap = (articles || [])
    .filter((a) => a.blog_categories?.slug)
    .map((a) => ({
      url: `${baseUrl}/blog/${a.blog_categories!.slug}/${a.slug}`,
      lastModified: new Date(a.updated_at),
      changeFrequency: 'monthly',
      priority: 0.7,
    }))

  return [...staticRoutes, ...categoryRoutes, ...verticalRoutes, ...articleRoutes]
}
