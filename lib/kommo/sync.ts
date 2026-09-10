'use client'

/**
 * Fire-and-forget call to /api/integrations/kommo/sync-reservation - the
 * reservation itself is already saved by the time this runs, so a
 * failed/slow Kommo sync should never block the UI. Errors are swallowed
 * (logged only) on purpose, same shape as lib/email/notify.ts's
 * sendReservationNotification; callers should not await this.
 */
export function syncReservationToKommo(reservationId: string): void {
  fetch('/api/integrations/kommo/sync-reservation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reservationId }),
  }).catch((err) => {
    console.error('[iplanit] Error triggering Kommo sync:', err)
  })
}
