'use client'

import React from 'react'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Calendar, Eye, EyeOff, Loader2, PartyPopper } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { Confetti } from '@/components/confetti'
import { PasswordStrength } from '@/components/password-strength'
import { useLanguage } from '@/context/language-context'
import { translateAuthError, isDuplicateSignupUser, withAuthLockRetry } from '@/lib/supabase/auth-errors'
import { getPasswordChecks, isPasswordStrongEnough } from '@/lib/password'

const TIMEZONES = [
  { value: 'America/Lima', label: 'Lima, Peru (GMT-5)' },
  { value: 'America/Denver', label: 'Denver, Colorado (GMT-7/6)' },
  { value: 'America/New_York', label: 'New York (GMT-5/4)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (GMT-8/7)' },
  { value: 'America/Mexico_City', label: 'Ciudad de Mexico (GMT-6)' },
  { value: 'America/Bogota', label: 'Bogota, Colombia (GMT-5)' },
]

const BUSINESS_TYPE_VALUES = [
  'coworking',
  'clinic',
  'dental',
  'veterinary',
  'spa',
  'salon',
  'gym',
  'restaurant',
  'education',
  'photography',
  'events',
  'consulting',
  'professional',
  'other',
] as const

export default function RegisterPage() {
  const router = useRouter()
  const { language, setLanguage, t } = useLanguage()
  const tr = t.auth.register
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [step, setStep] = useState<1 | 2 | 'success'>(1)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    businessName: '',
    businessType: '',
    timezone: '',
  })
  const [error, setError] = useState('')

  const passwordChecks = getPasswordChecks(formData.password)

  const LanguageToggle = (
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
  )

  const handleNext = () => {
    if (!formData.name || !formData.email || !formData.password) {
      setError(tr.fillAllFields)
      return
    }
    if (!isPasswordStrongEnough(passwordChecks)) {
      setError(tr.passwordRequirements)
      return
    }
    setError('')
    setStep(2)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.businessName || !formData.businessType || !formData.timezone) {
      setError(tr.fillAllFields)
      return
    }

    setIsLoading(true)

    try {
      // Sign up with Supabase Auth. business_name/business_type/timezone/language
      // ride along as user metadata and get picked up by the handle_new_user()
      // trigger, which creates the profile and the business in the same
      // transaction as the auth.users row - no separate client-callable
      // endpoint needed, and it works even when email confirmation is required.
      const { data: authData, error: signUpError } = await withAuthLockRetry(() =>
        supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              full_name: formData.name,
              business_name: formData.businessName,
              business_type: formData.businessType,
              timezone: formData.timezone,
              language,
            },
          },
        })
      )

      if (signUpError) {
        console.error('[iplanit] signUp error:', signUpError.message)
        setError(translateAuthError(signUpError.message, language))
        return
      }

      if (isDuplicateSignupUser(authData.user)) {
        setError(translateAuthError('User already registered', language))
        return
      }

      if (authData.user) {
        setStep('success')
        setTimeout(() => {
          router.push('/login?registered=true')
        }, 2600)
      }
    } catch (err) {
      setError(translateAuthError(null, language))
      console.error('Registration error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  if (step === 'success') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
        <Confetti />
        <Card className="w-full max-w-md text-center">
          <CardContent className="flex flex-col items-center gap-4 py-10">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <PartyPopper className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">{tr.successTitle}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{tr.successDesc}</p>
            </div>
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      {LanguageToggle}

      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
          <Calendar className="h-6 w-6 text-primary-foreground" />
        </div>
        <span className="text-2xl font-bold text-foreground">iPlanit</span>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">{tr.title}</CardTitle>
          <CardDescription>{step === 1 ? tr.stepPersonal : tr.stepBusiness}</CardDescription>
          <div className="flex items-center justify-center gap-2 pt-2">
            <div
              className={`h-2 w-2 rounded-full ${step >= 1 ? 'bg-primary' : 'bg-muted'}`}
            />
            <div
              className={`h-2 w-2 rounded-full ${step >= 2 ? 'bg-primary' : 'bg-muted'}`}
            />
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {step === 1 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">{tr.fullName}</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder={tr.fullNamePlaceholder}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">{tr.email}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={tr.emailPlaceholder}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">{tr.password}</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder={tr.passwordPlaceholderMin}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
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
                    password={formData.password}
                    labels={{ ...tr.passwordStrength, ...tr.passwordReq }}
                  />
                </div>

                <Button type="button" className="w-full" onClick={handleNext}>
                  {tr.continueBtn}
                </Button>
              </>
            )}

            {step === 2 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="businessName">{tr.businessName}</Label>
                  <Input
                    id="businessName"
                    type="text"
                    placeholder={tr.businessNamePlaceholder}
                    value={formData.businessName}
                    onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="businessType">{tr.businessType}</Label>
                  <Select
                    value={formData.businessType}
                    onValueChange={(value) => setFormData({ ...formData, businessType: value })}
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={tr.businessTypePlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {BUSINESS_TYPE_VALUES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {tr.businessTypes[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone">{tr.timezone}</Label>
                  <Select
                    value={formData.timezone}
                    onValueChange={(value) => setFormData({ ...formData, timezone: value })}
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={tr.timezonePlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 bg-transparent"
                    onClick={() => setStep(1)}
                    disabled={isLoading}
                  >
                    {tr.back}
                  </Button>
                  <Button type="submit" className="flex-1" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {tr.creating}
                      </>
                    ) : (
                      tr.createBtn
                    )}
                  </Button>
                </div>
              </>
            )}
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">{tr.haveAccount} </span>
            <Link href="/login" className="text-primary hover:underline">
              {tr.signIn}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
