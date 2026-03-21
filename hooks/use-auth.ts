'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  plan: string
  created_at: string
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    let mounted = true

    async function getUser() {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error) throw error
        
        if (mounted && user) {
          setUser(user)
          
          // Fetch profile from profiles table
          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single()
          
          if (profileData) {
            setProfile(profileData)
          } else {
            // Create a basic profile from user data
            setProfile({
              id: user.id,
              email: user.email || '',
              full_name: user.user_metadata?.full_name || null,
              avatar_url: null,
              plan: 'free',
              created_at: user.created_at,
            })
          }
        }
        
        if (mounted) {
          setLoading(false)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Error getting user')
          setLoading(false)
        }
      }
    }

    // Get current user
    getUser()

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (mounted) {
          setUser(session?.user ?? null)
          if (!session?.user) {
            setProfile(null)
          }
          setLoading(false)
        }
      }
    )

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      setUser(null)
      setProfile(null)
      router.push('/login')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error signing out')
    }
  }

  return { user, profile, loading, error, signOut }
}
