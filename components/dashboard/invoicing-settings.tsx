'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, Clock, Crown, FlaskConical, Loader2, Receipt, Save } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useLanguage } from '@/context/language-context'
import { isValidRuc } from '@/lib/invoicing/documents'

// Strings live here instead of language-context.tsx: this tab only exists for
// Peruvian businesses and its copy is long, so it's kept next to the UI.
const STRINGS = {
  es: {
    title: 'Facturacion electronica SUNAT',
    desc: 'Emite boletas y facturas validas ante SUNAT al terminar cada servicio.',
    upsellTitle: 'Incluida en el plan Premium',
    upsellDesc:
      'Con Premium emites hasta 1,000 boletas y facturas al mes desde iPlanit, con capacitacion y acompanamiento para la autorizacion ante SUNAT.',
    upsellCta: 'Ver plan Premium',
    statusPending: 'Pendiente de conexion',
    statusPendingDesc:
      'Completa tus datos y guarda. Nuestro equipo te contactara para autorizar el envio a SUNAT y conectar tu cuenta.',
    statusDemo: 'Conectado - modo pruebas',
    statusDemoDesc: 'Puedes probar la emision. Estos comprobantes no se envian a SUNAT.',
    statusProduction: 'Conectado - produccion',
    statusProductionDesc: 'Tus comprobantes se envian a SUNAT.',
    usage: 'Comprobantes este mes',
    usageOver: 'Superaste los incluidos: se suman ${usd} este mes ({docs} adicionales).',
    fiscalData: 'Datos de tu empresa',
    ruc: 'RUC',
    razonSocial: 'Razon social',
    direccion: 'Direccion fiscal',
    ubigeo: 'Ubigeo (opcional)',
    ubigeoHint: 'Codigo de 6 digitos de SUNAT, no es el codigo postal. Ej.: Miraflores, Lima = 150122. Puedes dejarlo vacio.',
    checkFields: 'Revisa los campos marcados.',
    taxes: 'Impuestos',
    pricesIncludeIgv: 'Mis precios ya incluyen IGV',
    affectation: 'Tipo de operacion',
    gravado: 'Gravado (IGV 18%)',
    exonerado: 'Exonerado',
    inafecto: 'Inafecto',
    series: 'Series',
    seriesHint: 'Usa series distintas a las de tu sistema anterior para no repetir numeros.',
    serieBoleta: 'Boletas',
    serieFactura: 'Facturas',
    serieNcBoleta: 'Notas de credito (boletas)',
    serieNcFactura: 'Notas de credito (facturas)',
    enabled: 'Activar emision de comprobantes',
    enabledHint: 'Se puede activar cuando tu cuenta este conectada.',
    save: 'Guardar',
    saved: 'Configuracion guardada',
    errors: {
      invalid_ruc: 'El RUC no es valido.',
      missing_razon_social: 'Ingresa la razon social.',
      missing_direccion: 'Ingresa la direccion fiscal.',
      invalid_ubigeo: 'El ubigeo debe tener 6 digitos (no es el codigo postal). Dejalo vacio si no lo sabes.',
      invalid_series: 'Revisa las series: boletas empiezan con B, facturas con F, 4 caracteres y todas distintas.',
      series_in_use: 'Otra sede con el mismo RUC ya usa una de esas series.',
      ruc_locked: 'No puedes cambiar el RUC despues de emitir comprobantes.',
      not_connected: 'Tu cuenta aun no esta conectada. Te avisaremos cuando puedas activarla.',
      no_access: 'La facturacion electronica esta incluida en el plan Premium.',
      generic: 'No se pudo guardar. Intenta de nuevo.',
    } as Record<string, string>,
  },
  en: {
    title: 'SUNAT electronic invoicing',
    desc: 'Issue receipts and invoices valid with SUNAT when each service is completed.',
    upsellTitle: 'Included in the Premium plan',
    upsellDesc:
      'With Premium you issue up to 1,000 receipts and invoices a month from iPlanit, with training and support for the SUNAT authorization.',
    upsellCta: 'See Premium plan',
    statusPending: 'Waiting for connection',
    statusPendingDesc:
      'Fill in your details and save. Our team will contact you to authorize sending to SUNAT and connect your account.',
    statusDemo: 'Connected - test mode',
    statusDemoDesc: 'You can test issuing. These documents are not sent to SUNAT.',
    statusProduction: 'Connected - production',
    statusProductionDesc: 'Your documents are sent to SUNAT.',
    usage: 'Documents this month',
    usageOver: 'You went over the included amount: ${usd} is added this month ({docs} extra).',
    fiscalData: 'Company details',
    ruc: 'RUC',
    razonSocial: 'Legal name',
    direccion: 'Fiscal address',
    ubigeo: 'Ubigeo (optional)',
    ubigeoHint: "SUNAT's 6-digit code, not the postal code. E.g. Miraflores, Lima = 150122. You can leave it empty.",
    checkFields: 'Check the highlighted fields.',
    taxes: 'Taxes',
    pricesIncludeIgv: 'My prices already include IGV',
    affectation: 'Operation type',
    gravado: 'Taxed (IGV 18%)',
    exonerado: 'Exempt',
    inafecto: 'Not subject to IGV',
    series: 'Series',
    seriesHint: 'Use series different from your previous system so numbers never repeat.',
    serieBoleta: 'Receipts',
    serieFactura: 'Invoices',
    serieNcBoleta: 'Credit notes (receipts)',
    serieNcFactura: 'Credit notes (invoices)',
    enabled: 'Turn on document issuing',
    enabledHint: 'Can be turned on once your account is connected.',
    save: 'Save',
    saved: 'Settings saved',
    errors: {
      invalid_ruc: 'The RUC is not valid.',
      missing_razon_social: 'Enter the legal name.',
      missing_direccion: 'Enter the fiscal address.',
      invalid_ubigeo: "The ubigeo must have 6 digits (it's not the postal code). Leave it empty if unsure.",
      invalid_series: 'Check the series: receipts start with B, invoices with F, 4 characters, all different.',
      series_in_use: 'Another location with the same RUC already uses one of those series.',
      ruc_locked: "You can't change the RUC after issuing documents.",
      not_connected: "Your account isn't connected yet. We'll let you know when you can turn it on.",
      no_access: 'Electronic invoicing is included in the Premium plan.',
      generic: "Couldn't save. Please try again.",
    } as Record<string, string>,
  },
}

type SettingsResponse = {
  available: boolean
  has_access: boolean
  configured: boolean
  enabled: boolean
  settings: null | {
    environment: 'demo' | 'production'
    token_configured: boolean
    ruc: string
    razon_social: string
    direccion_fiscal: string | null
    ubigeo: string | null
    serie_factura: string
    serie_boleta: string
    serie_nc_factura: string
    serie_nc_boleta: string
    prices_include_igv: boolean
    igv_affectation: 'gravado' | 'exonerado' | 'inafecto'
  }
  business_tax_id?: string | null
}

type FieldKey = 'ruc' | 'razonSocial' | 'direccionFiscal' | 'ubigeo' | 'serieBoleta' | 'serieFactura' | 'serieNcBoleta' | 'serieNcFactura'

// Which field each server error belongs to, so it's shown on the field
// itself instead of only in a toast.
const ERROR_FIELD: Record<string, FieldKey> = {
  invalid_ruc: 'ruc',
  ruc_locked: 'ruc',
  missing_razon_social: 'razonSocial',
  missing_direccion: 'direccionFiscal',
  invalid_ubigeo: 'ubigeo',
  invalid_series: 'serieBoleta',
  series_in_use: 'serieBoleta',
}

// Same order the fields appear on screen: the first error is scrolled to.
const FIELD_ORDER: FieldKey[] = [
  'ruc',
  'razonSocial',
  'direccionFiscal',
  'ubigeo',
  'serieBoleta',
  'serieFactura',
  'serieNcBoleta',
  'serieNcFactura',
]

type Usage ={ used?: number; included?: number; percent?: number | null; overage_docs?: number; overage_usd?: number }

export function InvoicingSettings({ businessId, onUpgrade }: { businessId: string; onUpgrade: () => void }) {
  const { language } = useLanguage()
  const s = STRINGS[language === 'en' ? 'en' : 'es']

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<SettingsResponse | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [form, setForm] = useState({
    ruc: '',
    razonSocial: '',
    direccionFiscal: '',
    ubigeo: '',
    pricesIncludeIgv: true,
    igvAffectation: 'gravado' as 'gravado' | 'exonerado' | 'inafecto',
    serieBoleta: 'B002',
    serieFactura: 'F002',
    serieNcBoleta: 'BC02',
    serieNcFactura: 'FC02',
    enabled: false,
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/invoicing/settings?business_id=${businessId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      const settings = json.settings as SettingsResponse
      setData(settings)
      setUsage(json.usage as Usage)
      const st = settings.settings
      setForm((prev) => ({
        ...prev,
        ruc: st?.ruc ?? settings.business_tax_id ?? '',
        razonSocial: st?.razon_social ?? '',
        direccionFiscal: st?.direccion_fiscal ?? '',
        ubigeo: st?.ubigeo ?? '',
        pricesIncludeIgv: st?.prices_include_igv ?? true,
        igvAffectation: st?.igv_affectation ?? 'gravado',
        serieBoleta: st?.serie_boleta ?? 'B002',
        serieFactura: st?.serie_factura ?? 'F002',
        serieNcBoleta: st?.serie_nc_boleta ?? 'BC02',
        serieNcFactura: st?.serie_nc_factura ?? 'FC02',
        enabled: settings.enabled,
      }))
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    load()
  }, [load])

  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({})

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    // Editing a field clears its error (series share one message).
    setFieldErrors((e) => {
      if (!(key in e) && !String(key).startsWith('serie')) return e
      const next = { ...e }
      delete next[key as FieldKey]
      if (String(key).startsWith('serie')) for (const k of FIELD_ORDER) if (k.startsWith('serie')) delete next[k]
      return next
    })
  }

  // Marks the fields, scrolls to the first one and focuses it.
  function showFieldErrors(errors: Partial<Record<FieldKey, string>>) {
    setFieldErrors(errors)
    const first = FIELD_ORDER.find((k) => errors[k])
    if (!first) return
    toast.error(s.checkFields)
    requestAnimationFrame(() => {
      const el = document.getElementById(`inv-${first}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.focus({ preventScroll: true })
    })
  }

  // Same checks as the server, so every problem shows at once.
  function validate(): Partial<Record<FieldKey, string>> {
    const errors: Partial<Record<FieldKey, string>> = {}
    if (!isValidRuc(form.ruc.trim())) errors.ruc = s.errors.invalid_ruc
    if (!form.razonSocial.trim()) errors.razonSocial = s.errors.missing_razon_social
    if (!form.direccionFiscal.trim()) errors.direccionFiscal = s.errors.missing_direccion
    if (form.ubigeo.trim() && !/^\d{6}$/.test(form.ubigeo.trim())) errors.ubigeo = s.errors.invalid_ubigeo
    const series = [form.serieBoleta, form.serieFactura, form.serieNcBoleta, form.serieNcFactura].map((x) => x.trim())
    const seriesOk =
      /^B[A-Z0-9]{3}$/.test(series[0]) &&
      /^F[A-Z0-9]{3}$/.test(series[1]) &&
      /^B[A-Z0-9]{3}$/.test(series[2]) &&
      /^F[A-Z0-9]{3}$/.test(series[3]) &&
      new Set(series).size === 4
    if (!seriesOk) errors.serieBoleta = s.errors.invalid_series
    return errors
  }

  async function handleSave() {
    const errors = validate()
    if (Object.keys(errors).length) {
      showFieldErrors(errors)
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/invoicing/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, ...form }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const field = ERROR_FIELD[json.error]
        const message = s.errors[json.error] ?? s.errors.generic
        if (field) showFieldErrors({ [field]: message })
        else toast.error(message)
        return
      }
      setFieldErrors({})
      toast.success(s.saved)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const fieldError = (key: FieldKey) =>
    fieldErrors[key] ? <p className="text-xs text-destructive">{fieldErrors[key]}</p> : null

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  if (!data.has_access) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            {s.title}
          </CardTitle>
          <CardDescription>{s.desc}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium">
                <Crown className="h-4 w-4 text-amber-500" />
                {s.upsellTitle}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{s.upsellDesc}</p>
            </div>
            <Button className="w-full shrink-0 sm:w-auto" onClick={onUpgrade}>
              {s.upsellCta}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const st = data.settings
  const connected = !!st?.token_configured
  const status = !connected
    ? { icon: Clock, label: s.statusPending, desc: s.statusPendingDesc, variant: 'secondary' as const }
    : st?.environment === 'production'
      ? { icon: Check, label: s.statusProduction, desc: s.statusProductionDesc, variant: 'default' as const }
      : { icon: FlaskConical, label: s.statusDemo, desc: s.statusDemoDesc, variant: 'outline' as const }
  const StatusIcon = status.icon

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            {s.title}
          </CardTitle>
          <CardDescription>{s.desc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4">
            <Badge variant={status.variant} className="gap-1">
              <StatusIcon className="h-3 w-3" />
              {status.label}
            </Badge>
            <p className="mt-2 text-sm text-muted-foreground">{status.desc}</p>
          </div>

          {connected && st?.environment === 'production' && usage?.included ? (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{s.usage}</span>
                <span className="font-medium tabular-nums">
                  {usage.used ?? 0} / {usage.included.toLocaleString()}
                </span>
              </div>
              <Progress value={Math.min(usage.percent ?? 0, 100)} />
              {(usage.overage_docs ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground">
                  {s.usageOver
                    .replace('{usd}', String(usage.overage_usd ?? 0))
                    .replace('{docs}', String(usage.overage_docs))}
                </p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.fiscalData}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="inv-ruc">{s.ruc}</Label>
              <Input
                id="inv-ruc"
                inputMode="numeric"
                maxLength={11}
                aria-invalid={!!fieldErrors.ruc}
                value={form.ruc}
                onChange={(e) => set('ruc', e.target.value.replace(/\D/g, ''))}
              />
              {fieldError('ruc')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-razonSocial">{s.razonSocial}</Label>
              <Input
                id="inv-razonSocial"
                aria-invalid={!!fieldErrors.razonSocial}
                value={form.razonSocial}
                onChange={(e) => set('razonSocial', e.target.value)}
              />
              {fieldError('razonSocial')}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-direccionFiscal">{s.direccion}</Label>
            <Input
              id="inv-direccionFiscal"
              aria-invalid={!!fieldErrors.direccionFiscal}
              value={form.direccionFiscal}
              onChange={(e) => set('direccionFiscal', e.target.value)}
            />
            {fieldError('direccionFiscal')}
          </div>
          <div className="space-y-2 sm:max-w-xs">
            <Label htmlFor="inv-ubigeo">{s.ubigeo}</Label>
            <Input
              id="inv-ubigeo"
              inputMode="numeric"
              maxLength={6}
              aria-invalid={!!fieldErrors.ubigeo}
              value={form.ubigeo}
              onChange={(e) => set('ubigeo', e.target.value.replace(/\D/g, ''))}
            />
            {fieldErrors.ubigeo ? fieldError('ubigeo') : <p className="text-xs text-muted-foreground">{s.ubigeoHint}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.taxes}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 sm:max-w-xs">
            <Label>{s.affectation}</Label>
            <Select value={form.igvAffectation} onValueChange={(v) => set('igvAffectation', v as typeof form.igvAffectation)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gravado">{s.gravado}</SelectItem>
                <SelectItem value="exonerado">{s.exonerado}</SelectItem>
                <SelectItem value="inafecto">{s.inafecto}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.igvAffectation === 'gravado' && (
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <Label htmlFor="inv-igv">{s.pricesIncludeIgv}</Label>
              <Switch id="inv-igv" checked={form.pricesIncludeIgv} onCheckedChange={(v) => set('pricesIncludeIgv', v)} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.series}</CardTitle>
          <CardDescription>{s.seriesHint}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ['serieBoleta', s.serieBoleta],
                ['serieFactura', s.serieFactura],
                ['serieNcBoleta', s.serieNcBoleta],
                ['serieNcFactura', s.serieNcFactura],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={`inv-${key}`}>{label}</Label>
                <Input
                  id={`inv-${key}`}
                  maxLength={4}
                  className="font-mono uppercase"
                  aria-invalid={!!fieldErrors.serieBoleta}
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value.toUpperCase())}
                />
              </div>
            ))}
          </div>
          {/* One message for the four series: the rules apply to them together. */}
          {fieldErrors.serieBoleta && <p className="mt-3 text-xs text-destructive">{fieldErrors.serieBoleta}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Switch
              id="inv-enabled"
              checked={form.enabled}
              disabled={!connected}
              onCheckedChange={(v) => set('enabled', v)}
            />
            <div>
              <Label htmlFor="inv-enabled">{s.enabled}</Label>
              {!connected && <p className="text-xs text-muted-foreground">{s.enabledHint}</p>}
            </div>
          </div>
          <Button className="w-full gap-2 sm:w-auto" disabled={saving} onClick={handleSave}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {s.save}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
