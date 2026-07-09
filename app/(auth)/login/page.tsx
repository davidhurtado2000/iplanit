'use client'

import React from 'react'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, Eye, EyeOff, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useLanguage } from '@/context/language-context'
import { translateAuthError } from '@/lib/supabase/auth-errors'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { language, setLanguage, t } = useLanguage()
  const tr = t.auth.login
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [usePassword, setUsePassword] = useState(true)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (searchParams.get('registered') === 'true') {
      setMessage(tr.registeredWelcome)
    }
    // Only re-run when the query param or language actually change, not on
    // every tr identity change (tr is a fresh object each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, language])

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setIsLoading(true)

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError(translateAuthError(signInError.message, language))
        return
      }

      if (data.user) {
        router.push('/dashboard')
      }
    } catch (err) {
      setError(translateAuthError(null, language))
    } finally {
      setIsLoading(false)
    }
  }

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setIsLoading(true)

    try {
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (signInError) {
        setError(translateAuthError(signInError.message, language))
        return
      }

      setMessage(tr.magicLinkSent)
      setEmail('')
    } catch (err) {
      setError(translateAuthError(null, language))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-4 flex w-full max-w-md justify-end">
        <div className="inline-flex overflow-hidden rounded-md border text-xs font-medium">
          <button
            type="button"
            onClick={() => setLanguage('es')}
            className={`px-2.5 py-1 ${language === 'es' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
          >
            ES
          </button>
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`border-l px-2.5 py-1 ${language === 'en' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
          >
            EN
          </button>
        </div>
      </div>

      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
          <Calendar className="h-6 w-6 text-primary-foreground" />
        </div>
        <span className="text-2xl font-bold text-foreground">iPlanit</span>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">{tr.title}</CardTitle>
          <CardDescription>{usePassword ? tr.subtitlePassword : tr.subtitleMagic}</CardDescription>
        </CardHeader>
        <CardContent>
          {message && (
            <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
              {message}
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={usePassword ? handlePasswordLogin : handleMagicLink} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{tr.email}</Label>
              <Input
                id="email"
                type="email"
                placeholder={tr.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            {usePassword && (
              <div className="space-y-2">
                <Label htmlFor="password">{tr.password}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={tr.passwordPlaceholder}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {usePassword ? tr.signingIn : tr.sendingMagic}
                </>
              ) : usePassword ? (
                tr.signInBtn
              ) : (
                tr.sendMagicBtn
              )}
            </Button>
          </form>

          <div className="mt-4 border-t pt-4 text-center text-sm">
            <button
              type="button"
              onClick={() => {
                setUsePassword(!usePassword)
                setError('')
                setMessage('')
              }}
              className="text-primary hover:underline"
            >
              {usePassword ? tr.useMagicLink : tr.usePassword}
            </button>
          </div>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">{tr.noAccount} </span>
            <Link href="/register" className="text-primary hover:underline">
              {tr.signUp}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
