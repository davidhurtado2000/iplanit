import type { MetadataRoute } from 'next'

// /dashboard and /app are the gated protectedRoutes from proxy.ts - no SEO
// value and shouldn't be crawled. /api and /auth (the Supabase OAuth
// callback) aren't content. /reservar/* are per-business booking pages
// meant to be shared directly (WhatsApp, Instagram bio), not discovered via
// search - indexing thousands of thin, customer-specific pages wouldn't
// help iplanit.io's own ranking and risks thin-content signals.
export default function robots(): MetadataRoute.Robots {
  // Same domain as sitemap.ts - must be the actual canonical (www) host,
  // not the apex, which redirects here.
  const baseUrl = 'https://www.iplanit.io'

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/app', '/api', '/auth', '/reservar', '/admin'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
