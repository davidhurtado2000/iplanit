// Server-only: sends Web Push notices to the devices of the people who should
// hear about a reservation. Called from the app's own routes (never from the
// database), and every failure is swallowed: a missing notice must never break
// a booking.
import webpush from 'web-push'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { buildPushMessage, pickRecipients, type PushKind, type PushLanguage } from './message'

export interface PushPayload {
  title: string
  body: string
  /** Where tapping the notice goes. */
  url: string
  /** Same tag = the new notice replaces the old one instead of piling up. */
  tag?: string
}

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY
// Must be a mailto: or a URL; the site address, so no personal address leaves.
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || process.env.NEXT_PUBLIC_APP_URL || 'https://www.iplanit.io'

/** Without the keys the whole feature is simply off (safe to deploy first). */
export function pushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC && VAPID_PRIVATE)
}

let vapidReady = false
function ensureVapid() {
  if (vapidReady) return
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC!, VAPID_PRIVATE!)
  vapidReady = true
}

export function createPushAdminClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

interface SubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

/** Pushes `payload` to every device of `userIds`. Devices the browser says are
 * gone (404/410) are removed. Returns how many were delivered to the push
 * service. */
export async function sendPushToUsers(
  admin: SupabaseClient,
  userIds: string[],
  payload: PushPayload
): Promise<{ sent: number; removed: number }> {
  if (!pushConfigured() || userIds.length === 0) return { sent: 0, removed: 0 }
  ensureVapid()

  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', userIds)
  if (error || !data) return { sent: 0, removed: 0 }

  let sent = 0
  const gone: string[] = []
  await Promise.all(
    (data as SubscriptionRow[]).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60, urgency: 'high' }
        )
        sent += 1
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) gone.push(sub.id)
        else console.error('[iplanit] push failed:', status ?? err)
      }
    })
  )
  if (gone.length > 0) await admin.from('push_subscriptions').delete().in('id', gone)
  return { sent, removed: gone.length }
}

/** Announces a reservation event to the owner, the team and the assigned
 * barber. Safe to call more than once for the same event: only the first call
 * sends (push_event_log). Never throws. */
export async function notifyReservationEvent(reservationId: string, kind: PushKind): Promise<void> {
  try {
    if (!pushConfigured()) return
    const admin = createPushAdminClient()

    const { data: r } = await admin
      .from('reservations')
      .select('id, business_id, worker_id, start_time, status, type, client_id, service_id')
      .eq('id', reservationId)
      .maybeSingle()
    if (!r) return
    // Only announce what really happened.
    if (kind === 'cancelled' && r.status !== 'cancelled') return
    if (kind === 'new' && r.status === 'cancelled') return

    // One notice per (reservation, event), ever: a retried request or a leaked
    // reservation id cannot spam the staff. Recorded only now, once we know
    // the event is real, so an early or bogus call cannot use it up.
    const { error: dupeError } = await admin.from('push_event_log').insert({ reservation_id: reservationId, kind })
    if (dupeError) {
      // 23505 = already announced. Anything else (e.g. the table is not
      // created yet) also means: do nothing.
      if (dupeError.code !== '23505') console.error('[iplanit] push log failed:', dupeError.message)
      return
    }

    const [{ data: business }, { data: client }, { data: service }, { data: extraRows }, { data: members }, { data: worker }] =
      await Promise.all([
        admin.from('businesses').select('owner_id, timezone, language').eq('id', r.business_id).maybeSingle(),
        admin.from('clients').select('name').eq('id', r.client_id).maybeSingle(),
        r.service_id ? admin.from('services').select('name').eq('id', r.service_id).maybeSingle() : Promise.resolve({ data: null }),
        admin.from('reservation_services').select('service_id, position').eq('reservation_id', reservationId).order('position'),
        admin.from('business_members').select('user_id').eq('business_id', r.business_id),
        r.worker_id ? admin.from('workers').select('name, user_id').eq('id', r.worker_id).maybeSingle() : Promise.resolve({ data: null }),
      ])
    if (!business) return

    let serviceName: string | null = (service as { name?: string } | null)?.name ?? null
    const extraIds = ((extraRows ?? []) as { service_id: string }[]).map((e) => e.service_id)
    if (serviceName && extraIds.length > 0) {
      const { data: extras } = await admin.from('services').select('id, name').in('id', extraIds)
      const names = extraIds.map((id) => (extras as { id: string; name: string }[] | null)?.find((s) => s.id === id)?.name).filter(Boolean)
      if (names.length > 0) serviceName = [serviceName, ...names].join(' + ')
    }

    const language: PushLanguage = business.language === 'en' ? 'en' : 'es'
    const message = buildPushMessage({
      kind,
      language,
      clientName: (client as { name?: string } | null)?.name ?? '-',
      serviceName: r.type === 'visit' ? null : serviceName,
      startTime: r.start_time,
      timezone: business.timezone || 'America/Lima',
      workerName: (worker as { name?: string } | null)?.name ?? null,
      pending: kind === 'new' && r.status === 'pending',
    })

    const recipients = pickRecipients({
      ownerId: business.owner_id,
      memberIds: ((members ?? []) as { user_id: string }[]).map((m) => m.user_id),
      workerUserId: (worker as { user_id?: string | null } | null)?.user_id ?? null,
    })
    const tag = `reservation-${reservationId}-${kind}`
    await Promise.all([
      sendPushToUsers(admin, recipients.staff, { ...message, url: '/dashboard/calendar', tag }),
      sendPushToUsers(admin, recipients.worker, { ...message, url: '/mi-agenda', tag }),
    ])
  } catch (err) {
    console.error('[iplanit] reservation push failed:', err)
  }
}
