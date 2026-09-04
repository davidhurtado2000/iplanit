'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
import { Building2, Loader2, CheckCircle2, XCircle, AlertTriangle, ParkingSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/context/language-context'
import { capitalizeFirst } from '@/lib/utils'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { LogoLoader } from '@/components/logo-loader'
import { sendReservationNotification } from '@/lib/email/notify'
import { LanguageToggle } from '@/components/language-toggle'

interface PublicReservationStatus {
  id: string
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  start_time: string
  client_name: string
  client_email: string | null
  service_name: string
  business_name: string
  business_timezone: string
  cancellation_policy_hours: number
  has_parking: boolean
  notify_cancellations: boolean
}

export default function ManageReservationPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const supabase = createClient()
  const { language, t, locale } = useLanguage()
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
      if (reservation.notify_cancellations && reservation.client_email) {
        sendReservationNotification('cancellation', reservation.id, language)
      }
    } catch (err) {
      console.error('[v0] Error cancelling public reservation:', err)
      setCancelError(tr.manageCancelError)
    } finally {
      setCancelling(false)
    }
  }

  if (loading) {
    return (
      <div className="booking-shell flex min-h-screen items-center justify-center bg-background">
        <LogoLoader />
      </div>
    )
  }

  if (notFound || !reservation) {
    return (
      <div className="booking-shell flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <Building2 className="h-10 w-10 text-muted-foreground/50" />
        <h1 className="text-xl font-semibold">{tr.manageNotFoundTitle}</h1>
        <p className="text-sm text-muted-foreground">{tr.manageNotFoundDesc}</p>
      </div>
    )
  }

  const canCancel = reservation.status === 'pending' || reservation.status === 'confirmed'

  return (
    <div className="booking-shell flex min-h-screen flex-col items-center bg-background px-4 py-10">
      <LanguageToggle className="max-w-md" />

      <Card className="w-full max-w-md border-none shadow-lg shadow-foreground/5">
        <CardContent className="flex flex-col items-center gap-0 px-4 py-8 text-center sm:px-6">
          <p className="text-sm text-muted-foreground">
            {capitalizeFirst(
              new Date(reservation.start_time).toLocaleDateString(locale, {
                timeZone: reservation.business_timezone,
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })
            )}
          </p>
          <p className="font-display text-4xl text-foreground sm:text-5xl">
            {new Date(reservation.start_time).toLocaleTimeString(locale, {
              timeZone: reservation.business_timezone,
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
          <p className="mt-1 font-display text-lg text-foreground">{reservation.service_name}</p>
          <p className="text-xs text-muted-foreground">{reservation.business_name}</p>

          <div className="mt-5 flex items-center gap-2 text-sm">
            <span className="font-medium text-foreground">{tr.manageStatusLabel}:</span>
            <StatusBadge status={reservation.status} labels={t.reservation} />
          </div>

          {reservation.has_parking && (
            <p className="mt-2 flex items-center gap-2 text-sm text-[var(--confirm)]">
              <ParkingSquare className="h-4 w-4 shrink-0" />
              {tr.manageParkingConfirmed}
            </p>
          )}

          {cancelled && (
            <div className="mt-4 flex w-full items-center gap-2 rounded-lg border bg-muted/40 p-3 text-left text-sm text-foreground">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--confirm)]" />
              {tr.manageCancelSuccess}
            </div>
          )}

          {!cancelled && reservation.status === 'cancelled' && (
            <div className="mt-4 flex w-full items-center gap-2 rounded-lg border bg-muted/40 p-3 text-left text-sm text-muted-foreground">
              <XCircle className="h-4 w-4 shrink-0" />
              {tr.manageAlreadyCancelled}
            </div>
          )}
          {reservation.status === 'completed' && (
            <div className="mt-4 flex w-full items-center gap-2 rounded-lg border bg-muted/40 p-3 text-left text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {tr.manageAlreadyCompleted}
            </div>
          )}
          {reservation.status === 'no_show' && (
            <div className="mt-4 flex w-full items-center gap-2 rounded-lg border bg-muted/40 p-3 text-left text-sm text-muted-foreground">
              <XCircle className="h-4 w-4 shrink-0" />
              {tr.manageAlreadyNoShow}
            </div>
          )}

          {cancelError && (
            <div className="mt-4 w-full rounded-md bg-destructive/10 p-3 text-sm text-destructive">{cancelError}</div>
          )}

          {canCancel && !cancelled && (
            <Button
              type="button"
              variant="destructive"
              className="mt-6 w-full"
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
