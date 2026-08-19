import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { verifyTurnstileToken } from '@/lib/turnstile'

// The public booking page used to call create_public_reservation directly
// from the browser via the anon key - which meant there was no way to see
// the caller's real IP (Postgres only ever sees Supabase's own connection)
// and therefore no way to rate-limit it. Routing through this Vercel route
// instead lets us read the actual client IP from the platform's own
// x-forwarded-for header (trustworthy - set by Vercel, not the client)
// before ever touching the database, then call the RPC with the
// service-role client exactly as the browser used to call it with the anon
// key. create_public_reservation is still security definer and still does
// every real business-logic validation itself (name/contact required,
// time conflicts, plan caps, etc.) - this route only adds a volume cap in
// front of it. See scripts/063-rate-limits.sql for the ledger table.
const RATE_LIMIT_WINDOW_MINUTES = 15
const RATE_LIMIT_MAX_ATTEMPTS = 8

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const slug = body?.p_slug as string | undefined
    if (!slug) {
      return NextResponse.json({ error: 'business_not_found' }, { status: 400 })
    }

    const ip = getClientIp(request)

    // Checked before ever touching the database - a failed/missing token
    // means this is very likely a script, not a customer, so it's rejected
    // ahead of the rate-limit write below rather than counting it as a
    // legitimate attempt.
    const isHuman = await verifyTurnstileToken(body?.turnstileToken, ip)
    if (!isHuman) {
      return NextResponse.json({ error: 'bot_verification_failed' }, { status: 400 })
    }

    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('public_booking_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('slug', slug)
      .eq('ip', ip)
      .gte('created_at', windowStart)

    if ((count ?? 0) >= RATE_LIMIT_MAX_ATTEMPTS) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    await supabase.from('public_booking_attempts').insert({ slug, ip })

    const { data, error } = await supabase.rpc('create_public_reservation', {
      p_slug: slug,
      p_service_id: body?.p_service_id ?? null,
      p_resource_id: body?.p_resource_id ?? null,
      p_start_time: body?.p_start_time,
      p_client_name: body?.p_client_name,
      p_client_email: body?.p_client_email ?? null,
      p_client_phone: body?.p_client_phone ?? null,
      p_notes: body?.p_notes ?? null,
      p_duration_option_id: body?.p_duration_option_id ?? null,
      p_needs_parking: body?.p_needs_parking ?? false,
      p_hours: body?.p_hours ?? null,
      p_document_number: body?.p_document_number ?? null,
    })

    if (error) {
      console.error('[iplanit] Error creating public reservation:', error)
      return NextResponse.json({ error: 'server_error' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('[iplanit] Error in public reservation route:', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
