import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const protectedRoutes = ['/dashboard', '/app']
const authRoutes = ['/login', '/register', '/forgot-password']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Start with a passthrough response so we can attach refreshed cookies to it
  let response = NextResponse.next({ request })

  // Create a Supabase client that can refresh the JWT and write updated
  // cookies to the response (required so the browser keeps a valid session)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  )
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route))

  if (isProtectedRoute && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
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
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
