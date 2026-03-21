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
import { Calendar, Eye, EyeOff, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

const TIMEZONES = [
  { value: 'America/Lima', label: 'Lima, Peru (GMT-5)' },
  { value: 'America/Denver', label: 'Denver, Colorado (GMT-7/6)' },
  { value: 'America/New_York', label: 'New York (GMT-5/4)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (GMT-8/7)' },
  { value: 'America/Mexico_City', label: 'Ciudad de Mexico (GMT-6)' },
  { value: 'America/Bogota', label: 'Bogota, Colombia (GMT-5)' },
]

const BUSINESS_TYPES = [
  { value: 'coworking', label: 'Coworking / Espacios de trabajo' },
  { value: 'clinic', label: 'Clinica / Consultorio medico' },
  { value: 'professional', label: 'Profesional independiente' },
]

export default function RegisterPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    businessName: '',
    businessType: '',
    timezone: '',
  })
  const [error, setError] = useState('')

  const handleNext = () => {
    if (!formData.name || !formData.email || !formData.password) {
      setError('Por favor completa todos los campos')
      return
    }
    if (formData.password.length < 6) {
      setError('La contrasena debe tener al menos 6 caracteres')
      return
    }
    setError('')
    setStep(2)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.businessName || !formData.businessType || !formData.timezone) {
      setError('Por favor completa todos los campos')
      return
    }

    setIsLoading(true)

    try {
      // Sign up with Supabase Auth
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.name,
          },
        },
      })

      if (signUpError) {
        setError(signUpError.message)
        return
      }

      if (authData.user) {
        console.log('[v0] User created:', authData.user.id)
        // Wait a moment for the profile trigger to complete
        await new Promise((resolve) => setTimeout(resolve, 1000))

        try {
          // Create business via API route
          console.log('[v0] Creating business...')
          const response = await fetch('/api/businesses/create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              owner_id: authData.user.id,
              name: formData.businessName,
              timezone: formData.timezone,
              slug: formData.businessName.toLowerCase().replace(/\s+/g, '-'),
            }),
          })

          const responseData = await response.json()

          if (!response.ok) {
            console.error('[v0] Business creation failed:', responseData)
            // Don't block registration if business creation fails
          } else {
            console.log('[v0] Business created successfully:', responseData.business)
          }
        } catch (err) {
          console.error('[v0] Business API error:', err)
          // Don't block registration
        }

        // Show success and redirect to login
        setTimeout(() => {
          router.push('/login?registered=true')
        }, 1000)
      }
    } catch (err) {
      setError('An error occurred. Please try again.')
      console.error('Registration error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
          <Calendar className="h-6 w-6 text-primary-foreground" />
        </div>
        <span className="text-2xl font-bold text-foreground">iReserve</span>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Crear cuenta</CardTitle>
          <CardDescription>
            {step === 1
              ? 'Ingresa tus datos personales'
              : 'Configura tu negocio'}
          </CardDescription>
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
                  <Label htmlFor="name">Nombre completo</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Tu nombre"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Correo electronico</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="tu@email.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Contrasena</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Minimo 6 caracteres"
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
                </div>

                <Button type="button" className="w-full" onClick={handleNext}>
                  Continuar
                </Button>
              </>
            )}

            {step === 2 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="businessName">Nombre de tu negocio</Label>
                  <Input
                    id="businessName"
                    type="text"
                    placeholder="Ej: Clinica Salud Plus"
                    value={formData.businessName}
                    onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="businessType">Tipo de negocio</Label>
                  <Select
                    value={formData.businessType}
                    onValueChange={(value) => setFormData({ ...formData, businessType: value })}
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {BUSINESS_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone">Zona horaria</Label>
                  <Select
                    value={formData.timezone}
                    onValueChange={(value) => setFormData({ ...formData, timezone: value })}
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona tu zona horaria" />
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
                    Atras
                  </Button>
                  <Button type="submit" className="flex-1" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creando...
                      </>
                    ) : (
                      'Crear cuenta'
                    )}
                  </Button>
                </div>
              </>
            )}
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">Ya tienes una cuenta? </span>
            <Link href="/login" className="text-primary hover:underline">
              Inicia sesion
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
