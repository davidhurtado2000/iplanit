'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Whether the signed-in user is ALSO linked as someone's worker
// (scripts/104) - an active owner/admin who additionally cuts hair at
// another shop keeps their dashboard but gets a "Mi agenda" nav link.
// Cached per user so the sidebar and mobile nav share one request.
const cache = new Map<string, Promise<boolean>>()

export function useHasWorkerAgenda(userId: string | null | undefined) {
  const [hasAgenda, setHasAgenda] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    if (!cache.has(userId)) {
      cache.set(
        userId,
        Promise.resolve(createClient().rpc('get_my_worker_links')).then(
          ({ data }) => Array.isArray(data) && data.length > 0,
          () => false
        )
      )
    }
    cache.get(userId)!.then((value) => {
      if (!cancelled) setHasAgenda(value)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  return hasAgenda
}
