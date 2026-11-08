import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isValidRuc } from '@/lib/invoicing/documents'
import { createInvoicingAdminClient } from '@/lib/invoicing/service'

// Owner/admin side of the invoicing settings: fiscal data, series, IGV and
// the on/off switch. The provider token and demo/production live in
// /api/admin/invoicing (platform admins only).

async function authorize(businessId: string | null) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'not_authenticated' }, { status: 401 }) }
  if (!businessId) return { error: NextResponse.json({ error: 'missing_business_id' }, { status: 400 }) }

  const { data: role } = await supabase.rpc('business_member_role', { target_business_id: businessId })
  if (role !== 'owner' && role !== 'admin') {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  }
  return { supabase, user }
}

export async function GET(request: Request) {
  const businessId = new URL(request.url).searchParams.get('business_id')
  const auth = await authorize(businessId)
  if ('error' in auth) return auth.error

  const [{ data: settings, error }, { data: usage }] = await Promise.all([
    auth.supabase.rpc('get_invoicing_settings', { p_business_id: businessId! }),
    auth.supabase.rpc('get_invoicing_usage', { p_business_id: businessId! }),
  ])
  if (error) return NextResponse.json({ error: 'load_failed' }, { status: 500 })
  return NextResponse.json({ settings, usage })
}

const SERIE = {
  boleta: /^B[A-Z0-9]{3}$/,
  factura: /^F[A-Z0-9]{3}$/,
}

type Body = {
  businessId?: string
  ruc?: string
  razonSocial?: string
  direccionFiscal?: string
  ubigeo?: string
  pricesIncludeIgv?: boolean
  igvAffectation?: 'gravado' | 'exonerado' | 'inafecto'
  serieBoleta?: string
  serieFactura?: string
  serieNcBoleta?: string
  serieNcFactura?: string
  enabled?: boolean
}

export async function POST(request: Request) {
  const body = ((await request.json().catch(() => null)) ?? {}) as Body
  const businessId = body.businessId ?? null
  const auth = await authorize(businessId)
  if ('error' in auth) return auth.error

  const admin = createInvoicingAdminClient()
  const { data: hasAccess } = await admin.rpc('business_has_invoicing_access', { p_business_id: businessId! })
  if (!hasAccess) return NextResponse.json({ error: 'no_access' }, { status: 403 })

  const ruc = (body.ruc ?? '').trim()
  const razonSocial = (body.razonSocial ?? '').trim()
  const direccionFiscal = (body.direccionFiscal ?? '').trim()
  const ubigeo = (body.ubigeo ?? '').trim()
  const series = {
    serie_boleta: (body.serieBoleta ?? 'B002').trim().toUpperCase(),
    serie_factura: (body.serieFactura ?? 'F002').trim().toUpperCase(),
    serie_nc_boleta: (body.serieNcBoleta ?? 'BC02').trim().toUpperCase(),
    serie_nc_factura: (body.serieNcFactura ?? 'FC02').trim().toUpperCase(),
  }

  if (!isValidRuc(ruc)) return NextResponse.json({ error: 'invalid_ruc' }, { status: 400 })
  if (!razonSocial) return NextResponse.json({ error: 'missing_razon_social' }, { status: 400 })
  if (!direccionFiscal) return NextResponse.json({ error: 'missing_direccion' }, { status: 400 })
  if (ubigeo && !/^\d{6}$/.test(ubigeo)) return NextResponse.json({ error: 'invalid_ubigeo' }, { status: 400 })
  if (
    !SERIE.boleta.test(series.serie_boleta) ||
    !SERIE.boleta.test(series.serie_nc_boleta) ||
    !SERIE.factura.test(series.serie_factura) ||
    !SERIE.factura.test(series.serie_nc_factura) ||
    new Set(Object.values(series)).size !== 4
  ) {
    return NextResponse.json({ error: 'invalid_series' }, { status: 400 })
  }
  const igvAffectation = body.igvAffectation ?? 'gravado'
  if (!['gravado', 'exonerado', 'inafecto'].includes(igvAffectation)) {
    return NextResponse.json({ error: 'invalid_igv' }, { status: 400 })
  }

  const { data: existing } = await admin
    .from('business_invoicing_settings')
    .select('ruc, api_token_encrypted')
    .eq('business_id', businessId!)
    .maybeSingle()

  // Comprobantes already issued belong to the old RUC: changing it would mix
  // two companies' numbering.
  if (existing && existing.ruc !== ruc) {
    const { count } = await admin
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId!)
      .eq('environment', 'production')
    if (count) return NextResponse.json({ error: 'ruc_locked' }, { status: 409 })
  }

  const enabled = !!body.enabled
  if (enabled && !existing?.api_token_encrypted) {
    return NextResponse.json({ error: 'not_connected' }, { status: 409 })
  }

  const values = {
    ruc,
    razon_social: razonSocial,
    direccion_fiscal: direccionFiscal,
    ubigeo: ubigeo || null,
    prices_include_igv: body.pricesIncludeIgv ?? true,
    igv_affectation: igvAffectation,
    igv_rate: igvAffectation === 'gravado' ? 18 : 0,
    ...series,
    enabled,
  }

  const { error } = existing
    ? await admin.from('business_invoicing_settings').update(values).eq('business_id', businessId!)
    : await admin
        .from('business_invoicing_settings')
        .insert({ business_id: businessId!, provider: 'lucode', mode: 'managed', api_url: null, api_token_encrypted: null, ...values })

  if (error) {
    // check_invoicing_series_unique (scripts/110): another business with the same RUC uses that series.
    if (error.message.includes('invoicing_series_in_use')) return NextResponse.json({ error: 'series_in_use' }, { status: 409 })
    return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
