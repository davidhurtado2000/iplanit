import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { encryptSecret } from '@/lib/crypto'
import { createInvoicingAdminClient, INVOICING_KEY_ENV } from '@/lib/invoicing/service'
import { LucodeProvider } from '@/lib/invoicing/providers/lucode'
import { ProviderRequestError } from '@/lib/invoicing/types'

// Platform-admin side of invoicing: connect each business to Lucode (paste
// the company token Lucode gives per RUC) and move it from demo to
// production. Business owners never see or handle the token.

async function requirePlatformAdmin() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  const { data: isAdmin } = await supabase.rpc('is_platform_admin')
  if (!isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return null
}

export async function GET() {
  const denied = await requirePlatformAdmin()
  if (denied) return denied

  const admin = createInvoicingAdminClient()
  const { data: rows, error } = await admin
    .from('business_invoicing_settings')
    .select('business_id, ruc, razon_social, environment, enabled, api_token_encrypted, updated_at')
    .order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'load_failed' }, { status: 500 })

  const ids = (rows ?? []).map((r) => r.business_id)
  const { data: businesses } = ids.length
    ? await admin.from('businesses').select('id, name').in('id', ids)
    : { data: [] as { id: string; name: string }[] }
  const names = new Map((businesses ?? []).map((b) => [b.id, b.name]))

  const result = await Promise.all(
    (rows ?? []).map(async (r) => {
      const [{ data: hasAccess }, { data: usage }] = await Promise.all([
        admin.rpc('business_has_invoicing_access', { p_business_id: r.business_id }),
        admin.rpc('get_invoicing_usage', { p_business_id: r.business_id }),
      ])
      return {
        businessId: r.business_id,
        businessName: names.get(r.business_id) ?? '',
        ruc: r.ruc,
        razonSocial: r.razon_social,
        environment: r.environment,
        enabled: r.enabled,
        tokenConfigured: !!r.api_token_encrypted,
        hasAccess: !!hasAccess,
        usage,
      }
    }),
  )
  return NextResponse.json({ businesses: result })
}

type Body = { businessId?: string; token?: string; environment?: 'demo' | 'production' }

export async function POST(request: Request) {
  const denied = await requirePlatformAdmin()
  if (denied) return denied

  const body = ((await request.json().catch(() => null)) ?? {}) as Body
  if (!body.businessId) return NextResponse.json({ error: 'missing_business_id' }, { status: 400 })

  const admin = createInvoicingAdminClient()
  const { data: settings } = await admin
    .from('business_invoicing_settings')
    .select('*')
    .eq('business_id', body.businessId)
    .maybeSingle()
  if (!settings) return NextResponse.json({ error: 'not_configured' }, { status: 404 })

  const patch: { api_token_encrypted?: string; provider?: 'lucode'; environment?: 'demo' | 'production' } = {}

  const token = body.token?.trim()
  if (token) {
    // Check the token before saving: a status query for a number that can't
    // exist answers "not found" with a valid token and 401 with a bad one.
    try {
      await new LucodeProvider({ token, environment: 'demo' }).getStatus({
        docType: '03',
        serie: settings.serie_boleta,
        numero: 99999999,
      })
    } catch (err) {
      if (err instanceof ProviderRequestError) return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
      return NextResponse.json({ error: 'provider_unreachable' }, { status: 502 })
    }
    patch.api_token_encrypted = encryptSecret(token, INVOICING_KEY_ENV)
    patch.provider = 'lucode'
  }

  if (body.environment && body.environment !== settings.environment) {
    if (body.environment === 'production') {
      if (!settings.api_token_encrypted && !patch.api_token_encrypted) {
        return NextResponse.json({ error: 'not_connected' }, { status: 409 })
      }
      // Demo and production share the (RUC, series) counter: clear the demo
      // comprobantes so the first real one is number 1.
      const { error } = await admin.rpc('clear_demo_invoices', { p_ruc: settings.ruc })
      if (error) return NextResponse.json({ error: 'clear_demo_failed' }, { status: 500 })
    } else {
      // Going back to demo after real comprobantes would reuse real numbers.
      const { count } = await admin
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('ruc', settings.ruc)
        .eq('environment', 'production')
      if (count) return NextResponse.json({ error: 'has_production_invoices' }, { status: 409 })
    }
    patch.environment = body.environment
  }

  if (!Object.keys(patch).length) return NextResponse.json({ success: true })

  const { error } = await admin.from('business_invoicing_settings').update(patch).eq('business_id', body.businessId)
  if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  return NextResponse.json({ success: true })
}
