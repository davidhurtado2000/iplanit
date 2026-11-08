'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, Clock, FlaskConical, KeyRound, Loader2, Receipt, Rocket } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

// Platform-admin page: connect each Premium business to Lucode and move it
// to production. Business owners fill their fiscal data in Settings >
// Facturacion; their row shows up here once they save it.

type Row = {
  businessId: string
  businessName: string
  ruc: string
  razonSocial: string
  environment: 'demo' | 'production'
  enabled: boolean
  tokenConfigured: boolean
  hasAccess: boolean
  usage: { used?: number; included?: number } | null
}

const ERRORS: Record<string, string> = {
  invalid_token: 'Lucode rechazo el token. Revisa que lo copiaste completo.',
  provider_unreachable: 'No se pudo contactar a Lucode. Intenta de nuevo.',
  not_connected: 'Primero guarda el token de este negocio.',
  has_production_invoices: 'Este RUC ya emitio comprobantes reales: no puede volver a pruebas.',
  clear_demo_failed: 'No se pudieron borrar los comprobantes de prueba.',
}

export default function AdminInvoicingPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/invoicing')
      const json = await res.json()
      setRows(res.ok ? json.businesses : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function update(businessId: string, payload: { token?: string; environment?: 'demo' | 'production' }) {
    setBusy(businessId)
    try {
      const res = await fetch('/api/admin/invoicing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, ...payload }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(ERRORS[json.error] ?? 'No se pudo guardar.')
        return
      }
      toast.success(payload.token ? 'Token verificado y guardado' : 'Ambiente actualizado')
      setTokens((t) => ({ ...t, [businessId]: '' }))
      await load()
    } finally {
      setBusy(null)
    }
  }

  function goProduction(row: Row) {
    const ok = window.confirm(
      `Pasar "${row.businessName}" (RUC ${row.ruc}) a produccion?\n\n` +
        'Desde ahora sus comprobantes se envian a SUNAT de verdad, y se borran los comprobantes de prueba de este RUC. ' +
        'Hazlo solo cuando Lucode confirme que recibio la autorizacion en SUNAT.',
    )
    if (ok) update(row.businessId, { environment: 'production' })
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Receipt className="h-6 w-6 text-primary" />
          Facturacion electronica
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Negocios que guardaron sus datos fiscales. Pega el token que Lucode te da para su RUC, prueba en modo pruebas y
          pasalos a produccion cuando la autorizacion en SUNAT este lista.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Ningun negocio ha guardado sus datos de facturacion todavia.
          </CardContent>
        </Card>
      ) : (
        rows.map((row) => (
          <Card key={row.businessId}>
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{row.businessName}</p>
                  <p className="text-sm text-muted-foreground">
                    {row.razonSocial} · RUC <span className="font-mono">{row.ruc}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!row.hasAccess && <Badge variant="destructive">Sin Premium</Badge>}
                  {!row.tokenConfigured ? (
                    <Badge variant="secondary" className="gap-1">
                      <Clock className="h-3 w-3" /> Sin conectar
                    </Badge>
                  ) : row.environment === 'production' ? (
                    <Badge className="gap-1">
                      <Check className="h-3 w-3" /> Produccion
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <FlaskConical className="h-3 w-3" /> Pruebas
                    </Badge>
                  )}
                  <Badge variant={row.enabled ? 'default' : 'secondary'}>{row.enabled ? 'Emision activa' : 'Emision apagada'}</Badge>
                </div>
              </div>

              {row.environment === 'production' && row.usage?.included ? (
                <p className="text-sm text-muted-foreground">
                  Este mes: {row.usage.used ?? 0} / {row.usage.included.toLocaleString()} comprobantes
                </p>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder={row.tokenConfigured ? 'Reemplazar token de Lucode' : 'Pegar token de Lucode de este RUC'}
                  value={tokens[row.businessId] ?? ''}
                  onChange={(e) => setTokens((t) => ({ ...t, [row.businessId]: e.target.value }))}
                />
                <Button
                  variant="outline"
                  className="gap-2 sm:w-auto"
                  disabled={busy === row.businessId || !(tokens[row.businessId] ?? '').trim()}
                  onClick={() => update(row.businessId, { token: tokens[row.businessId] })}
                >
                  {busy === row.businessId ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  Guardar token
                </Button>
              </div>

              {row.tokenConfigured && row.environment === 'demo' && (
                <Button
                  className="w-full gap-2 sm:w-auto"
                  disabled={busy === row.businessId}
                  onClick={() => goProduction(row)}
                >
                  <Rocket className="h-4 w-4" />
                  Pasar a produccion
                </Button>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
