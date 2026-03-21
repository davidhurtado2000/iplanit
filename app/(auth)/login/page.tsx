'use client'

import React from 'react'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, Eye, EyeOff, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [usePassword, setUsePassword] = useState(true)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

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
        setError(signInError.message)
        return
      }

      if (data.user) {
        router.push('/dashboard')
      }
    } catch (err) {
      setError('An error occurred. Please try again.')
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
        setError(signInError.message)
        return
      }

      setMessage('¡Link de acceso enviado a tu email! Revisa tu bandeja de entrada.')
      setEmail('')
    } catch (err) {
      setError('An error occurred. Please try again.')
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
          <CardTitle className="text-2xl font-bold">Iniciar sesion</CardTitle>
          <CardDescription>
            {usePassword
              ? 'Ingresa tus credenciales para acceder a tu cuenta'
              : 'Te enviaremos un link para acceder sin contraseña'}
          </CardDescription>
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
              <Label htmlFor="email">Correo electronico</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            {usePassword && (
              <div className="space-y-2">
                <Label htmlFor="password">Contrasena</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="********"
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
                  {usePassword ? 'Iniciando sesion...' : 'Enviando link...'}
                </>
              ) : usePassword ? (
                'Iniciar sesion'
              ) : (
                'Enviar link de acceso'
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
              {usePassword ? 'O usa un link de acceso sin contrasena' : 'O usa contrasena'}
            </button>
          </div>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">No tienes una cuenta? </span>
            <Link href="/register" className="text-primary hover:underline">
              Registrate
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
