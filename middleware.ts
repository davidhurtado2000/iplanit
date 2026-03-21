import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const protectedRoutes = ['/dashboard', '/app']
const authRoutes = ['/login', '/register', '/forgot-password']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Create a Supabase client for the middleware
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
        },
      },
    }
  )

  // Get the session
  const {
    data: { session },
  } = await supabase.auth.getSession()

  // Check if the route is protected
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  )
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route))

  // If no session and trying to access protected route, redirect to login
  if (isProtectedRoute && !session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // If session exists and trying to access auth routes, redirect to dashboard
  if (isAuthRoute && session) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
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
