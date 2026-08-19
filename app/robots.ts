import type { MetadataRoute } from 'next'

// /dashboard and /app are the gated protectedRoutes from proxy.ts - no SEO
// value and shouldn't be crawled. /api and /auth (the Supabase OAuth
// callback) aren't content. /reservar/* are per-business booking pages
// meant to be shared directly (WhatsApp, Instagram bio), not discovered via
// search - indexing thousands of thin, customer-specific pages wouldn't
// help iplanit.io's own ranking and risks thin-content signals.
export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://iplanit.io'

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/app', '/api', '/auth', '/reservar', '/admin'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
