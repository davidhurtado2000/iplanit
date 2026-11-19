import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const protectedRoutes = ['/dashboard', '/app', '/admin', '/mi-agenda']
const authRoutes = ['/login', '/register', '/forgot-password']

// How long the session check may wait for Supabase before giving up. When
// the database is overloaded (504/522 in Supabase's edge logs) every protected
// request would otherwise hang for a minute and then bounce the person to the
// login page saying their session expired - even though it is perfectly valid.
const AUTH_TIMEOUT_MS = 6000

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS)
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

// "Supabase didn't answer" (timeout, 5xx, an HTML error page) as opposed to
// "Supabase answered and says this session is invalid" (a 4xx AuthApiError or
// no session at all). Only the second one means logged out.
function isAuthOutage(error: { name?: string; status?: number } | null): boolean {
  if (!error) return false
  return (
    error.name === 'AuthRetryableFetchError' ||
    error.name === 'AuthUnknownError' ||
    (typeof error.status === 'number' && error.status >= 500)
  )
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  )
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route))

  // Public pages (landing, /reservar/*, /terms, /privacy, etc.) never need
  // the user's identity, so skip the Supabase round-trip entirely for them.
  // This isn't just a perf win - every skipped call is one less concurrent
  // request racing to refresh the same session token. Supabase rotates
  // refresh tokens on use, so when two requests refresh at nearly the same
  // instant, the loser gets a 400 (invalid_grant) and getUser() below would
  // report "not logged in" even though the other request's refresh
  // succeeded - seen in production logs as spurious auth failures during
  // bursts of navigation (e.g. clicking around quickly during a demo).
  // Restricting getUser() to only the routes that actually check the result
  // cuts most of that unnecessary concurrency.
  if (!isProtectedRoute && !isAuthRoute) {
    return NextResponse.next({ request })
  }

  // Next.js Link prefetches every sidebar/nav link that scrolls into view,
  // each firing its own middleware invocation - during normal dashboard
  // clicking this can produce several concurrent requests that all try to
  // refresh the same soon-to-expire session at once. Only the first to land
  // actually succeeds (Supabase rotates the refresh token on use); the
  // rest get a 400 and would otherwise be treated as "logged out" below,
  // even though the session is fine. The real navigation that follows a
  // prefetch always hits this middleware again as a non-prefetch request,
  // so skipping the refresh here doesn't weaken route protection - it just
  // avoids using a prefetch to gamble with the one refresh token available.
  if (request.headers.get('next-router-prefetch') === '1') {
    return NextResponse.next({ request })
  }

  // Start with a passthrough response so we can attach refreshed cookies to it
  let response = NextResponse.next({ request })

  // Create a Supabase client that can refresh the JWT and write updated
  // cookies to the response (required so the browser keeps a valid session)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: fetchWithTimeout },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Write to the request (so server components can read it this cycle)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // Recreate the response so it carries the updated Set-Cookie headers
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() is preferred over getSession() in middleware – it validates the
  // JWT server-side and also triggers a token refresh when needed.
  // Ordinary pages only decide "dashboard or login", so they trust the session
  // cookie (getSession: reads it and renews it only when it has expired)
  // instead of asking Supabase to validate it on EVERY request (getUser = a
  // network + database round trip per page, the GET /user calls that timed
  // out during the 2026-11-17 outages). The data itself is protected by
  // row-level security on every query, which does not depend on this check.
  // Admin pages keep the strict server-side check.
  const strict = pathname.startsWith('/admin')
  let user: { id: string } | null = null
  let authError: { name?: string; status?: number } | null = null
  if (strict) {
    const res = await supabase.auth.getUser()
    user = res.data.user
    authError = res.error
  } else {
    const res = await supabase.auth.getSession()
    // Only whether there is a live session matters here - not who it is.
    user = res.data.session ? { id: 'session' } : null
    authError = res.error
  }

  const hadSession = request.cookies.getAll().some((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token'))

  // Supabase is down or too slow to answer: we can't tell whether this session
  // is valid, so don't log anyone out over it. Someone WITH a session cookie
  // goes through and the page shows its own loading/error state (their data
  // is protected by row-level security either way); someone without one still
  // goes to the login page below.
  if (isProtectedRoute && !user && hadSession && isAuthOutage(authError)) {
    return response
  }

  if (isProtectedRoute && !user) {
    const loginUrl = new URL('/login', request.url)
    // A stale sb-*-auth-token cookie means there WAS a session that's now
    // invalid/expired (e.g. a background tab whose refresh timer got
    // throttled long enough for the token to lapse - see the comment in
    // context/auth-context.tsx) - worth telling the person why they got
    // bounced instead of silently landing on the login form, as if their
    // click on "Go to dashboard" had done nothing. No cookie at all just
    // means they were never signed in, which needs no explanation.
    if (hadSession) loginUrl.searchParams.set('expired', '1')
    return NextResponse.redirect(loginUrl)
  }

  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Return the response with any refreshed session cookies attached
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - sw.js (the push service worker: public, no session needed)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sw.js).*)',
  ],
}
