// Server-only: uses the service-role key and decrypts provider tokens.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { decryptSecret } from '@/lib/crypto'
import type { Database } from '@/lib/supabase/types'
import type { DraftSettings } from './build-draft'
import type { EmitContext } from './emit'
import { LucodeProvider } from './providers/lucode'
import { MockProvider } from './providers/mock'
import { SupabaseInvoiceStore } from './supabase-store'
import type { InvoiceProvider } from './types'

// Key for the per-business provider tokens (lib/crypto.ts). Never rotate it:
// every stored token would become unreadable.
export const INVOICING_KEY_ENV = 'INVOICING_ENCRYPTION_KEY'

type SettingsRow = Database['public']['Tables']['business_invoicing_settings']['Row']

export type InvoicingSetup = {
  settings: SettingsRow
  draftSettings: DraftSettings
  provider: InvoiceProvider
  store: SupabaseInvoiceStore
  environment: 'demo' | 'production'
}

export type SetupErrorCode = 'no_access' | 'not_configured' | 'disabled' | 'no_token' | 'unsupported_provider'

export type SetupResult = { ok: true; setup: InvoicingSetup } | { ok: false; code: SetupErrorCode; message: string }

const SETUP_ERRORS: Record<SetupErrorCode, string> = {
  no_access: 'La facturación electrónica está incluida en el plan Premium (solo negocios en Perú).',
  not_configured: 'La facturación electrónica aún no está configurada para este negocio.',
  disabled: 'La emisión de comprobantes está desactivada para este negocio.',
  no_token: 'Falta conectar este negocio con el proveedor de facturación.',
  unsupported_provider: 'El proveedor de facturación configurado no está disponible.',
}

const fail = (code: SetupErrorCode): SetupResult => ({ ok: false, code, message: SETUP_ERRORS[code] })

// Service-role client: invoices, counters and settings are only writable by
// the service role. Only use it after checking the caller may act on the
// business.
export function createInvoicingAdminClient(): SupabaseClient<Database> {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

export function createProvider(settings: SettingsRow): InvoiceProvider | null {
  if (settings.provider === 'mock') return new MockProvider()
  if (settings.provider !== 'lucode' || !settings.api_token_encrypted) return null
  return new LucodeProvider({
    token: decryptSecret(settings.api_token_encrypted, INVOICING_KEY_ENV),
    environment: settings.environment,
  })
}

// Everything needed to emit for one business: plan access, settings, the
// provider with its decrypted token, and the database store.
// requireEnabled=false is for retries of comprobantes already created, which
// must still finish even if the owner switched emission off meanwhile.
export async function loadInvoicingSetup(
  db: SupabaseClient<Database>,
  businessId: string,
  opts: { requireEnabled?: boolean } = {},
): Promise<SetupResult> {
  const { data: hasAccess, error: accessError } = await db.rpc('business_has_invoicing_access', {
    p_business_id: businessId,
  })
  if (accessError) throw new Error(`No se pudo verificar el plan: ${accessError.message}`)
  if (!hasAccess) return fail('no_access')

  const { data: settings, error } = await db
    .from('business_invoicing_settings')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer la configuración de facturación: ${error.message}`)
  if (!settings) return fail('not_configured')
  if ((opts.requireEnabled ?? true) && !settings.enabled) return fail('disabled')
  if (settings.provider !== 'mock' && !settings.api_token_encrypted) return fail('no_token')

  const provider = createProvider(settings)
  if (!provider) return fail('unsupported_provider')

  return {
    ok: true,
    setup: {
      settings,
      provider,
      store: new SupabaseInvoiceStore(db),
      environment: settings.environment,
      draftSettings: {
        serieBoleta: settings.serie_boleta,
        serieFactura: settings.serie_factura,
        serieNcBoleta: settings.serie_nc_boleta,
        serieNcFactura: settings.serie_nc_factura,
        pricesIncludeIgv: settings.prices_include_igv,
        igvRate: Number(settings.igv_rate),
        igvAffectation: settings.igv_affectation,
      },
    },
  }
}

export function emitContext(
  setup: InvoicingSetup,
  opts: { businessId: string; reservationId: string | null; createdBy: string | null; relatedInvoiceId?: string | null },
): EmitContext {
  return {
    businessId: opts.businessId,
    ruc: setup.settings.ruc,
    environment: setup.environment,
    reservationId: opts.reservationId,
    relatedInvoiceId: opts.relatedInvoiceId ?? null,
    createdBy: opts.createdBy,
  }
}
