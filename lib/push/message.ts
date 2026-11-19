// Web Push: what the notice says and who gets it. Pure (no network, no
// database) so it is easy to test; lib/push/send.ts does the sending.

export type PushKind = 'new' | 'cancelled'
export type PushLanguage = 'es' | 'en'

export interface PushMessageInput {
  kind: PushKind
  language: PushLanguage
  clientName: string
  /** Main service plus extras ("Corte + Barba"); null for a visit. */
  serviceName: string | null
  startTime: string
  timezone: string
  /** The barber it was assigned to, if any. */
  workerName?: string | null
  /** A booking that still needs the business to approve it. */
  pending?: boolean
}

export interface PushMessage {
  title: string
  body: string
}

const TITLES: Record<PushLanguage, { new: string; newPending: string; cancelled: string }> = {
  es: { new: 'Nueva reserva', newPending: 'Nueva reserva por confirmar', cancelled: 'Reserva cancelada' },
  en: { new: 'New booking', newPending: 'New booking to confirm', cancelled: 'Booking cancelled' },
}

export function buildPushMessage(input: PushMessageInput): PushMessage {
  const t = TITLES[input.language]
  const when = new Date(input.startTime).toLocaleString(input.language === 'en' ? 'en-US' : 'es-PE', {
    timeZone: input.timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
  const parts = [input.clientName, input.serviceName, when, input.workerName].filter(
    (p): p is string => !!p && p.trim().length > 0
  )
  return {
    title: input.kind === 'cancelled' ? t.cancelled : input.pending ? t.newPending : t.new,
    body: parts.join(' · '),
  }
}

export interface RecipientInput {
  ownerId: string | null
  /** business_members of the business (admins, sales). */
  memberIds: string[]
  /** The assigned barber's own account, if they have one (workers.user_id). */
  workerUserId?: string | null
}

export interface Recipients {
  /** Owner and team: see every booking of the business. */
  staff: string[]
  /** The assigned barber, only when they are not already in `staff`: they
   * only ever hear about their own appointments. */
  worker: string[]
}

export function pickRecipients(input: RecipientInput): Recipients {
  const staff = Array.from(new Set([input.ownerId, ...input.memberIds].filter((id): id is string => !!id)))
  const worker = input.workerUserId && !staff.includes(input.workerUserId) ? [input.workerUserId] : []
  return { staff, worker }
}
