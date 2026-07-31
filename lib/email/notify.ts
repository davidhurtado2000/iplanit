'use client'

/**
 * Fire-and-forget call to /api/notifications/reservation - the reservation
 * itself is already saved by the time this runs, so a failed/slow email
 * should never block the UI or roll anything back. Errors are swallowed
 * (logged only) on purpose; callers should not await this for their own
 * success/error handling.
 */
export function sendReservationNotification(
  type: 'confirmation' | 'cancellation',
  reservationId: string,
  language: 'es' | 'en'
): void {
  fetch('/api/notifications/reservation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, reservationId, language }),
  }).catch((err) => {
    console.error('[iplanit] Error triggering reservation notification:', err)
  })
}
