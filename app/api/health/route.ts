import { NextResponse } from 'next/server'

// Liveness check for an external uptime monitor (UptimeRobot or similar): GET
// https://<site>/api/health answers 200 only when Supabase's login service AND
// its database answer within a few seconds, 503 otherwise - so an outage like
// the one on 2026-11-17 reaches whoever runs the site before it reaches a
// customer. Exposes nothing: no data, no versions, just ok/not ok.
//
// It uses the public anon key and a public RPC (the one the booking page
// already calls), so it works without any secret and adds one tiny query per
// check.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const TIMEOUT_MS = 5000

async function ok(url: string, init: RequestInit): Promise<boolean> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}

async function check() {
  const started = Date.now()
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!base || !anon) return { ok: false, auth: false, db: false, ms: 0 }
  const headers = { apikey: anon, Authorization: `Bearer ${anon}` }

  const [auth, db] = await Promise.all([
    ok(`${base}/auth/v1/health`, { headers }),
    // A real (if trivial) database query: looks up a business that doesn't exist.
    ok(`${base}/rest/v1/rpc/get_public_business`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_slug: '__health_check__' }),
    }),
  ])
  return { ok: auth && db, auth, db, ms: Date.now() - started }
}

// The address is public, so a flood of requests must not turn into a flood of
// requests to Supabase (which is the fragile part): answers are reused for a
// few seconds. A monitor checking every minute or two still sees a fresh result.
const CACHE_MS = 15_000
let cached: { at: number; result: Awaited<ReturnType<typeof check>> } | null = null

async function cachedCheck() {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.result
  const result = await check()
  cached = { at: Date.now(), result }
  return result
}

export async function GET() {
  const result = await cachedCheck()
  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}

// Some monitors probe with HEAD.
export async function HEAD() {
  const result = await cachedCheck()
  return new Response(null, { status: result.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } })
}
