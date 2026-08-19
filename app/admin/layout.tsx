'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { createClient } from '@/lib/supabase/client'

/**
 * Blog CMS admin - separate from /dashboard on purpose (this is iPlanit's
 * own platform content, not a tenant business, so it has nothing to do with
 * BusinessProvider/DashboardDataProvider). proxy.ts already requires a
 * valid session to reach here at all; this layout adds the actual
 * authorization check - membership in `platform_admins`
 * (scripts/065-blog.sql), a table-driven allowlist rather than a
 * hardcoded email, so adding another admin later is just a row insert.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [checking, setChecking] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace('/login')
      return
    }

    let cancelled = false
    const supabase = createClient()
    // platform_admins itself has no policy granting authenticated users
    // read access, even to their own row (scripts/065-blog.sql) - the RPC
    // is security definer, so it can answer the yes/no question without
    // ever exposing the table's rows to the client.
    supabase
      .rpc('is_platform_admin')
      .then(({ data }) => {
        if (cancelled) return
        if (!data) {
          router.replace('/dashboard')
          return
        }
        setIsAdmin(true)
        setChecking(false)
      })

    return () => {
      cancelled = true
    }
  }, [authLoading, user, router])

  if (authLoading || checking || !isAdmin) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Forced dark via a plain `.dark` class, not next-themes' ThemeProvider -
  // see the comment in app/blog/layout.tsx for why nesting it doesn't work
  // in the installed version.
  return <div className="dark min-h-screen bg-background text-foreground">{children}</div>
}
