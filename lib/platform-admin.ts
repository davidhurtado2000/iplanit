import { createClient } from '@/lib/supabase/client'

// Whether the signed-in user is the platform's own admin (scripts/065).
// The desktop sidebar and the mobile nav are both mounted at once and each
// asked the database on its own - one shared request per user instead.
const cache = new Map<string, Promise<boolean>>()

export function isPlatformAdmin(userId: string): Promise<boolean> {
  let pending = cache.get(userId)
  if (!pending) {
    pending = Promise.resolve(createClient().rpc('is_platform_admin')).then(
      ({ data }) => !!data,
      () => false
    )
    cache.set(userId, pending)
  }
  return pending
}
