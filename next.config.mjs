/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Vercel already redirects HTTP->HTTPS at the edge, but that redirect
  // itself is one plaintext round-trip an attacker on the same network
  // could intercept (SSL-stripping) - HSTS tells the browser to never even
  // attempt HTTP for this origin again after the first HTTPS visit, closing
  // that gap. The other two are standard, zero-risk hardening headers with
  // no app-code impact.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

export default nextConfig