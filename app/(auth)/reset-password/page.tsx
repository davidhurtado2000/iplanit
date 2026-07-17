'use client'

import React from 'react'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, Eye, EyeOff, Loader2, CheckCircle2, AlertTriangle, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { PasswordStrength } from '@/components/password-strength'
import { useAuth } from '@/hooks/use-auth'
import { useLanguage } from '@/context/language-context'
import { translateAuthError, withAuthLockRetry, withTimeout, AuthTimeoutError } from '@/lib/supabase/auth-errors'
import { getPasswordChecks, isPasswordStrongEnough } from '@/lib/password'

// Defined at module scope (not inside the page component) so it keeps a
// stable identity across renders - defining it inside the component body
// made React treat it as a brand-new component type on every keystroke,
// unmounting and remounting the inputs and dropping focus after each character.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
          <Calendar className="h-6 w-6 text-primary-foreground" />
        </div>
        <span className="text-2xl font-bold text-foreground">iPlanit</span>
      </div>
      <Card className="w-full max-w-md">{children}</Card>
    </div>
  )
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { language, t } = useLanguage()
  const tr = t.auth.resetPassword
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  const passwordChecks = getPasswordChecks(password)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setTimedOut(false)

    if (!isPasswordStrongEnough(passwordChecks)) {
      setError(tr.passwordRequirements)
      return
    }
    if (password !== confirmPassword) {
      setError(tr.passwordsDontMatch)
      return
    }

    setIsLoading(true)
    try {
      // Seen in practice: this call can succeed server-side (password does
      // get changed) while the client-side promise never settles, leaving
      // the UI stuck on the loading state forever. Race it against a
      // timeout so the user gets an actionable message instead of an
      // infinite spinner - see withTimeout()'s docstring.
      const { error: updateError } = await withTimeout(
        withAuthLockRetry(() => supabase.auth.updateUser({ password })),
        8000
      )

      if (updateError) {
        console.error('[iplanit] updateUser error:', updateError.message)
        setError(translateAuthError(updateError.message, language))
        return
      }

      setSuccess(true)
      setTimeout(() => {
        router.push('/dashboard')
      }, 2000)
    } catch (err) {
      if (err instanceof AuthTimeoutError) {
        setTimedOut(true)
        return
      }
      console.error('[iplanit] unexpected auth error:', err)
      setError(translateAuthError(null, language))
    } finally {
      setIsLoading(false)
    }
  }

  if (authLoading) {
    return (
      <Shell>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Shell>
    )
  }

  // The /auth/callback route exchanges the recovery link's code for a
  // session before landing here - if there's still no user, the link was
  // invalid, already used, or expired.
  if (!user) {
    return (
      <Shell>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">{tr.invalidLinkTitle}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{tr.invalidLinkDesc}</p>
          </div>
          <Link href="/forgot-password">
            <Button>{tr.requestNewLink}</Button>
          </Link>
        </CardContent>
      </Shell>
    )
  }

  if (success) {
    return (
      <Shell>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">{tr.successTitle}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{tr.successDesc}</p>
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Shell>
    )
  }

  if (timedOut) {
    return (
      <Shell>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
            <Clock className="h-8 w-8 text-amber-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">{tr.timeoutTitle}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{tr.timeoutDesc}</p>
          </div>
          <Link href="/dashboard">
            <Button>{tr.goToDashboard}</Button>
          </Link>
        </CardContent>
      </Shell>
    )
  }

  return (
    <Shell>
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold">{tr.title}</CardTitle>
        <CardDescription>{tr.subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}

          <div className="space-y-2">
            <Label htmlFor="password">{tr.newPassword}</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder={tr.passwordPlaceholderMin}
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
            <PasswordStrength
              password={password}
              labels={{ ...t.auth.register.passwordStrength, ...t.auth.register.passwordReq }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{tr.confirmPassword}</Label>
            <Input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              placeholder={tr.passwordPlaceholderMin}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {tr.updating}
              </>
            ) : (
              tr.updateBtn
            )}
          </Button>
        </form>
      </CardContent>
    </Shell>
  )
}
