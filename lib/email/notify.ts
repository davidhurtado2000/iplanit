'use client'

/**
 * Fire-and-forget call to /api/notifications/reservation - the reservation
 * itself is already saved by the time this runs, so a failed/slow email
 * should never block the UI or roll anything back. Errors are swallowed
 * (logged only) on purpose; callers should not await this for their own
 * success/error handling.
 */
export function sendReservationNotification(
  type: 'confirmation' | 'cancellation' | 'approved',
  reservationId: string,
  language: 'es' | 'en',
  // Cancelled by the client on the manage page: they already saw it on
  // screen, so only group attendees get the email.
  opts: { cancelledByClient?: boolean } = {}
): void {
  fetch('/api/notifications/reservation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, reservationId, language, cancelledByClient: !!opts.cancelledByClient }),
  }).catch((err) => {
    console.error('[iplanit] Error triggering reservation notification:', err)
  })
}
