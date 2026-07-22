'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Building2, Clock, Loader2, CheckCircle2, XCircle, AlertTriangle, ParkingSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/context/language-context'
import { capitalizeFirst } from '@/lib/utils'
import { getStatusBadgeVariant, getStatusLabel } from '@/lib/reservation-status'

interface PublicReservationStatus {
  id: string
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  start_time: string
  client_name: string
  service_name: string
  business_name: string
  business_timezone: string
  cancellation_policy_hours: number
  has_parking: boolean
}

export default function ManageReservationPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const supabase = createClient()
  const { language, setLanguage, t, locale } = useLanguage()
  const tr = t.publicBooking

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [reservation, setReservation] = useState<PublicReservationStatus | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [cancelled, setCancelled] = useState(false)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      setLoading(true)
      const { data } = await supabase.rpc('get_public_reservation_status', { p_reservation_id: id })
      const res = data as PublicReservationStatus | null
      if (!res || !res.id) {
        setNotFound(true)
      } else {
        setReservation(res)
      }
      setLoading(false)
    }
    load()
  }, [id])

  const isWithinPolicyWindow =
    reservation != null &&
    new Date(reservation.start_time).getTime() - Date.now() < reservation.cancellation_policy_hours * 60 * 60 * 1000

  const handleCancel = async () => {
    if (!reservation) return
    setCancelling(true)
    setCancelError('')
    try {
      const { data, error } = await supabase.rpc('cancel_public_reservation', {
        p_reservation_id: reservation.id,
      })
      if (error) throw error
      const result = data as { success?: boolean; error?: string }
      if (result.error) {
        setCancelError(tr.manageCancelError)
        return
      }
      setShowConfirm(false)
      setCancelled(true)
      setReservation({ ...reservation, status: 'cancelled' })
    } catch (err) {
      console.error('[v0] Error cancelling public reservation:', err)
      setCancelError(tr.manageCancelError)
    } finally {
      setCancelling(false)
    }
  }

  const LanguageToggle = (
    <div className="mb-4 flex w-full max-w-lg justify-end">
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (notFound || !reservation) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/30 px-4 text-center">
        <Building2 className="h-10 w-10 text-muted-foreground/50" />
        <h1 className="text-xl font-semibold">{tr.manageNotFoundTitle}</h1>
        <p className="text-sm text-muted-foreground">{tr.manageNotFoundDesc}</p>
      </div>
    )
  }

  const canCancel = reservation.status === 'pending' || reservation.status === 'confirmed'

  return (
    <div className="flex min-h-screen flex-col items-center bg-muted/30 px-4 py-10">
      {LanguageToggle}

      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {reservation.business_name}
          </CardTitle>
          <CardDescription>{reservation.service_name}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
            <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>
              {capitalizeFirst(
                new Date(reservation.start_time).toLocaleDateString(locale, {
                  timeZone: reservation.business_timezone,
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              )}
            </span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{tr.manageStatusLabel}:</span>
            <Badge variant={getStatusBadgeVariant(reservation.status)}>
              {getStatusLabel(reservation.status, t.reservation)}
            </Badge>
          </div>

          {reservation.has_parking && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ParkingSquare className="h-4 w-4 shrink-0" />
              {tr.manageParkingConfirmed}
            </div>
          )}

          {cancelled && (
            <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {tr.manageCancelSuccess}
            </div>
          )}

          {!cancelled && reservation.status === 'cancelled' && (
            <div className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
              <XCircle className="h-4 w-4 shrink-0" />
              {tr.manageAlreadyCancelled}
            </div>
          )}
          {reservation.status === 'completed' && (
            <div className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {tr.manageAlreadyCompleted}
            </div>
          )}
          {reservation.status === 'no_show' && (
            <div className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
              <XCircle className="h-4 w-4 shrink-0" />
              {tr.manageAlreadyNoShow}
            </div>
          )}

          {cancelError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{cancelError}</div>
          )}

          {canCancel && !cancelled && (
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              onClick={() => setShowConfirm(true)}
            >
              {tr.manageCancelBtn}
            </Button>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-muted-foreground">{tr.poweredBy}</p>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr.manageCancelConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">{tr.manageCancelConfirmDesc}</span>
              {isWithinPolicyWindow && (
                <span className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {tr.manageCancelWindowWarning
                    .replace('{hours}', String(reservation.cancellation_policy_hours))
                    .replace('{business}', reservation.business_name)}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>{tr.manageKeepBtn}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleCancel()
              }}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {cancelling ? tr.manageCancelling : tr.manageCancelBtn}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
