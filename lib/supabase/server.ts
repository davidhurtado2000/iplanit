import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './types'

// Same cookie-based session pattern already used in app/auth/callback/route.ts
// - reads the logged-in user's session from request cookies. Needed for API
// routes, which the proxy.ts matcher explicitly skips (see its `api`
// exclusion), so they can't rely on middleware having already run.
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a context that can't set cookies (e.g. after the
            // response already started) - safe to ignore, same as the
            // auth callback route this pattern is copied from.
          }
        },
      },
    }
  )
}
