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
import { Calendar, Eye, EyeOff, Loader2, Check, X, PartyPopper } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { Confetti } from '@/components/confetti'
import { useLanguage } from '@/context/language-context'
import { translateAuthError, isDuplicateSignupUser } from '@/lib/supabase/auth-errors'

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

type PasswordChecks = {
  length: boolean
  uppercase: boolean
  lowercase: boolean
  number: boolean
  special: boolean
}

function getPasswordChecks(password: string): PasswordChecks {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  }
}

const PASSWORD_REQUIREMENT_KEYS: (keyof PasswordChecks)[] = ['length', 'uppercase', 'lowercase', 'number', 'special']

function getPasswordStrength(checks: PasswordChecks): 'weak' | 'medium' | 'strong' {
  const coreCount = [checks.length, checks.uppercase, checks.lowercase, checks.number].filter(Boolean).length
  if (coreCount <= 1) return 'weak'
  if (coreCount <= 3) return 'medium'
  return checks.special ? 'strong' : 'medium'
}

function isPasswordStrongEnough(checks: PasswordChecks) {
  return checks.length && checks.uppercase && checks.lowercase && checks.number
}

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
  const passwordStrength = getPasswordStrength(passwordChecks)

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
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
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

      if (signUpError) {
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

                  {formData.password.length > 0 && (
                    <div className="space-y-1.5 rounded-md border bg-muted/40 p-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full transition-all ${
                              passwordStrength === 'strong'
                                ? 'w-full bg-green-500'
                                : passwordStrength === 'medium'
                                  ? 'w-2/3 bg-yellow-500'
                                  : 'w-1/3 bg-destructive'
                            }`}
                          />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground">
                          {tr.passwordStrength[passwordStrength]}
                        </span>
                      </div>
                      <ul className="grid grid-cols-1 gap-1 pt-1 sm:grid-cols-2">
                        {PASSWORD_REQUIREMENT_KEYS.map((key) => (
                          <li key={key} className="flex items-center gap-1.5 text-xs">
                            {passwordChecks[key] ? (
                              <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
                            ) : (
                              <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span className={passwordChecks[key] ? 'text-foreground' : 'text-muted-foreground'}>
                              {tr.passwordReq[key]}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
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
