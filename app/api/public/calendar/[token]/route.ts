import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

// Google/Apple Calendar sync (V1 - ICS feed, no OAuth). The worker's
// calendar_feed_token (scripts/100-worker-calendar-feed.sql) IS the auth
// here - calendar apps re-fetch this URL on their own schedule with no way
// to send a bearer token or session cookie, so an unguessable URL is the
// only mechanism available, same as Google Calendar's own "secret address
// in iCal format" links. Looked up with the service-role key on purpose:
// there's no logged-in user on the other end to apply RLS as.
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function toIcsDateTime(isoString: string): string {
  return new Date(isoString).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: worker } = await supabase
    .from('workers')
    .select('id, name, business_id')
    .eq('calendar_feed_token', token)
    .maybeSingle()

  if (!worker) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('name, address')
    .eq('id', worker.business_id)
    .single()

  // Only what's still useful to see in a personal calendar going forward -
  // cancelled reservations no longer hold the slot, and nothing older than
  // yesterday matters for "don't double-book me". Capped at 180 days out /
  // 500 rows so one far-future recurring series can't make the feed huge.
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const to = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString()

  const { data: reservations } = await supabase
    .from('reservations')
    .select('id, start_time, end_time, status, client_id, service_id')
    .eq('worker_id', worker.id)
    .neq('status', 'cancelled')
    .gte('start_time', from)
    .lte('start_time', to)
    .order('start_time')
    .limit(500)

  const clientIds = [...new Set((reservations || []).map((r) => r.client_id))]
  const serviceIds = [...new Set((reservations || []).flatMap((r) => (r.service_id ? [r.service_id] : [])))]

  const [{ data: clients }, { data: services }] = await Promise.all([
    clientIds.length > 0
      ? supabase.from('clients').select('id, name').in('id', clientIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    serviceIds.length > 0
      ? supabase.from('services').select('id, name').in('id', serviceIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ])
  const clientNameById = new Map((clients || []).map((c) => [c.id, c.name]))
  const serviceNameById = new Map((services || []).map((s) => [s.id, s.name]))

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//iPlanit//Calendar Feed//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(`${business?.name || 'iPlanit'} - ${worker.name}`)}`,
  ]

  for (const r of reservations || []) {
    const clientName = clientNameById.get(r.client_id)
    const serviceName = r.service_id ? serviceNameById.get(r.service_id) : undefined
    const summary = [serviceName, clientName].filter(Boolean).join(' - ') || 'Reserva'

    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.id}@iplanit.io`,
      `DTSTAMP:${toIcsDateTime(new Date().toISOString())}`,
      `DTSTART:${toIcsDateTime(r.start_time)}`,
      `DTEND:${toIcsDateTime(r.end_time)}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      ...(business?.address ? [`LOCATION:${escapeIcsText(business.address)}`] : []),
      `STATUS:${r.status === 'confirmed' || r.status === 'completed' ? 'CONFIRMED' : 'TENTATIVE'}`,
      'END:VEVENT'
    )
  }

  lines.push('END:VCALENDAR')

  return new NextResponse(lines.join('\r\n'), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  })
}
