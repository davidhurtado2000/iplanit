'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Session, User } from '@supabase/supabase-js'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  plan: string
  language: string
  created_at: string
}

type AuthContextType = {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  error: string | null
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProfile = async (userId: string, userEmail?: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (data) {
        setProfile(data)
      } else {
        setProfile({
          id: userId,
          email: userEmail || '',
          full_name: null,
          avatar_url: null,
          plan: 'free',
          language: 'es',
          created_at: new Date().toISOString(),
        })
      }
    } catch {
      // ignore profile fetch errors
    }
  }

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id, user.email)
  }

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) throw error
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          await fetchProfile(session.user.id, session.user.email)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error checking session')
      } finally {
        setLoading(false)
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
        if (session?.user) {
          // Supabase's own docs warn against awaiting Supabase calls
          // directly inside this callback: it runs synchronously as part
          // of the client's internal auth state dispatch, and blocking it
          // here can stall/hang later auth calls made from anywhere else
          // in the app. This was the actual cause of updateUser() hanging
          // forever on /reset-password even though the password had
          // already been changed server-side - the USER_UPDATED event fired
          // this callback, which awaited a DB query before returning, which
          // held up updateUser()'s own promise. Deferring with setTimeout
          // lets this callback return immediately, unblocking the client.
          const userId = session.user.id
          const userEmail = session.user.email
          setTimeout(() => {
            fetchProfile(userId, userEmail)
          }, 0)
        } else {
          setProfile(null)
        }
      }
    )

    // Browsers throttle/suspend timers in background tabs, which can stall
    // supabase-js's own background token-refresh loop. Leaving a tab in the
    // background long enough lets the session expire silently, so every
    // action after switching back does nothing until a hard reload gets a
    // fresh session. This is Supabase's documented fix: explicitly pause
    // auto-refresh while hidden and resume it the moment the tab is visible
    // again, instead of relying on the background timer.
    //
    // Deliberately NOT calling this once synchronously on mount: doing so
    // raced the auth-token NavigatorLock against the getSession() call just
    // above (both fire practically simultaneously on every mount), and
    // supabase-js's lock gets "stolen" from whichever call loses, surfacing
    // as NavigatorLockAcquireTimeoutError on the next auth call (e.g.
    // updateUser on /reset-password). autoRefreshToken is already on by
    // default from client construction, so the initial call added nothing.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.startAutoRefresh()
      } else {
        supabase.auth.stopAutoRefresh()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      subscription?.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setProfile(null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, error, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider')
  }
  return context
}
