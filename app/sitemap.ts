import type { MetadataRoute } from 'next'

// Only the pages meant for organic discovery - /dashboard, /login,
// /register, etc. are functional/gated pages nobody finds via search, and
// per-business /reservar/[slug] pages are customer-specific rather than
// content Google should rank (see app/robots.ts, which disallows them).
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://iplanit.io'

  return [
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
  ]
}
