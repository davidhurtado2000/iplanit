'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

// Singleton: one client instance shared across the entire app.
// Multiple instances cause auth token sync issues (silent query failures).
let _client: ReturnType<typeof createBrowserClient<Database>> | undefined

export function createClient() {
  if (!_client) {
    _client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _client
}

export const supabase = createClient()
