'use client'

import React from 'react'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, Loader2, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useLanguage } from '@/context/language-context'
import { translateAuthError, withAuthLockRetry } from '@/lib/supabase/auth-errors'

export default function ForgotPasswordPage() {
  const { language, setLanguage, t } = useLanguage()
  const tr = t.auth.forgotPassword
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const { error: resetError } = await withAuthLockRetry(() =>
        supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        })
      )

      // Supabase doesn't reveal whether the email exists (anti-enumeration),
      // so any non-rate-limit error still shows the generic "check your
      // email" success state rather than leaking account existence.
      if (resetError) {
        console.error('[iplanit] resetPasswordForEmail error:', resetError.message)
        if (/rate limit|security purposes/i.test(resetError.message)) {
          setError(translateAuthError(resetError.message, language))
          return
        }
      }

      setSent(true)
    } catch (err) {
      console.error('[iplanit] unexpected auth error:', err)
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
        {sent ? (
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Mail className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">{tr.successTitle}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{tr.successDesc}</p>
            </div>
            <Link href="/login" className="text-sm text-primary hover:underline">
              {tr.backToLogin}
            </Link>
          </CardContent>
        ) : (
          <>
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="text-2xl font-bold">{tr.title}</CardTitle>
              <CardDescription>{tr.subtitle}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

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

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {tr.sending}
                    </>
                  ) : (
                    tr.sendBtn
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center text-sm">
                <Link href="/login" className="text-primary hover:underline">
                  {tr.backToLogin}
                </Link>
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  )
}
