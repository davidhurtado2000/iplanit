'use client'

import { useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'
import { useLanguage } from '@/context/language-context'

const GRACE_PERIOD_DAYS = 30

interface DeletionScheduledScreenProps {
  deletionRequestedAt: string
}

// Rendered by the dashboard layout in place of the normal app whenever
// profile.deletion_requested_at is set (see scripts/051 + app/api/account/*)
// - the only way out is cancelling here or letting the 30-day grace period
// run out (app/api/cron/purge-deleted-accounts finalizes it).
export function DeletionScheduledScreen({ deletionRequestedAt }: DeletionScheduledScreenProps) {
  const { refreshProfile, signOut } = useAuth()
  const { t, locale } = useLanguage()
  const tr = t.accountDeletion
  const [isCancelling, setIsCancelling] = useState(false)
  const [error, setError] = useState('')

  const deletionDate = new Date(deletionRequestedAt)
  deletionDate.setDate(deletionDate.getDate() + GRACE_PERIOD_DAYS)
  const formattedDate = deletionDate.toLocaleDateString(locale, {
    dateStyle: 'long',
  })

  const handleCancelDeletion = async () => {
    setError('')
    setIsCancelling(true)
    try {
      const res = await fetch('/api/account/cancel-deletion', { method: 'POST' })
      const data = await res.json()
      if (!data.success) throw new Error('cancel_failed')
      await refreshProfile()
    } catch (err) {
      console.error('[iplanit] Error cancelling account deletion:', err)
      setError(tr.cancelDeletionError)
    } finally {
      setIsCancelling(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-xl">{tr.scheduledTitle}</CardTitle>
          <CardDescription>{tr.scheduledDesc.replace('{date}', formattedDate)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          <Button className="w-full" onClick={handleCancelDeletion} disabled={isCancelling}>
            {isCancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tr.cancelDeletionBtn}
          </Button>
          <Button variant="outline" className="w-full" onClick={signOut} disabled={isCancelling}>
            {tr.signOutInstead}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
