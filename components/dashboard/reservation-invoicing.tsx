'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertCircle, Ban, Check, Clock, FileText, FlaskConical, Loader2, Receipt, RotateCw, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'

// Strings kept next to the UI (Peru-only feature), same as invoicing-settings.tsx.
const STRINGS = {
  es: {
    title: 'Comprobante electronico',
    loading: 'Cargando comprobantes...',
    demo: 'Modo pruebas',
    emit: 'Emitir comprobante',
    boleta: 'Boleta',
    factura: 'Factura',
    creditNote: 'Nota de credito',
    customer: 'Cliente',
    noDocument: 'Sin documento',
    amount: 'Monto total',
    description: 'Descripcion',
    subtotal: 'Subtotal',
    igv: 'IGV',
    total: 'Total',
    confirmEmit: 'Emitir',
    cancel: 'Cancelar',
    needsCompletion: 'Para emitir, marca la reserva como completada y registra el pago.',
    notReady: {
      disabled: 'Comprobantes electronicos: activa la emision en Ajustes > Facturacion.',
      not_configured: 'Comprobantes electronicos: completa tus datos en Ajustes > Facturacion.',
      no_token: 'Comprobantes electronicos: tu cuenta aun no esta conectada a SUNAT.',
    } as Record<string, string>,
    status: {
      pending: 'Enviando',
      sent: 'Esperando a SUNAT',
      accepted: 'Aceptado',
      rejected: 'Rechazado',
      error: 'Error',
      voided: 'Anulado',
    } as Record<string, string>,
    pdf: 'PDF',
    retry: 'Reintentar',
    void: 'Anular',
    voidTitle: 'Anular con nota de credito',
    voidReason: 'Motivo',
    voidConfirm: 'Emitir nota de credito',
    reasons: {
      '01': 'Anulacion de la operacion',
      '02': 'Error en el RUC',
      '03': 'Error en la descripcion',
      '06': 'Devolucion total',
    } as Record<string, string>,
    emitted: 'Comprobante emitido',
    sentPending: 'Comprobante enviado, esperando respuesta de SUNAT',
    voided: 'Nota de credito emitida',
    generic: 'No se pudo completar. Intenta de nuevo.',
    errors: {
      factura_requires_ruc: 'Para emitir una factura, el cliente necesita un RUC valido en su ficha.',
      factura_requires_name: 'Para emitir una factura, el cliente necesita su razon social en su ficha.',
      boleta_requires_document: 'Las boletas de mas de S/ 700 necesitan el DNI del cliente en su ficha.',
      no_amount: 'Ingresa el monto a facturar.',
      exchange_rate_required: 'Las boletas en dolares sin documento del cliente aun no estan soportadas.',
      disabled: 'La emision de comprobantes esta desactivada en Ajustes > Facturacion.',
      not_completed: 'La reserva debe estar completada.',
      not_paid: 'Registra el pago de la reserva primero.',
    } as Record<string, string>,
  },
  en: {
    title: 'Electronic receipt',
    loading: 'Loading receipts...',
    demo: 'Test mode',
    emit: 'Issue receipt',
    boleta: 'Boleta',
    factura: 'Factura',
    creditNote: 'Credit note',
    customer: 'Customer',
    noDocument: 'No document',
    amount: 'Total amount',
    description: 'Description',
    subtotal: 'Subtotal',
    igv: 'IGV',
    total: 'Total',
    confirmEmit: 'Issue',
    cancel: 'Cancel',
    needsCompletion: 'To issue one, mark the reservation completed and record the payment.',
    notReady: {
      disabled: 'Electronic receipts: turn on issuing in Settings > Invoicing.',
      not_configured: 'Electronic receipts: fill in your details in Settings > Invoicing.',
      no_token: "Electronic receipts: your account isn't connected to SUNAT yet.",
    } as Record<string, string>,
    status: {
      pending: 'Sending',
      sent: 'Waiting for SUNAT',
      accepted: 'Accepted',
      rejected: 'Rejected',
      error: 'Error',
      voided: 'Voided',
    } as Record<string, string>,
    pdf: 'PDF',
    retry: 'Retry',
    void: 'Void',
    voidTitle: 'Void with a credit note',
    voidReason: 'Reason',
    voidConfirm: 'Issue credit note',
    reasons: {
      '01': 'Transaction cancelled',
      '02': 'Wrong RUC',
      '03': 'Wrong description',
      '06': 'Full refund',
    } as Record<string, string>,
    emitted: 'Receipt issued',
    sentPending: 'Receipt sent, waiting for SUNAT',
    voided: 'Credit note issued',
    generic: "Couldn't complete it. Please try again.",
    errors: {
      factura_requires_ruc: "To issue a factura, the client's profile needs a valid RUC.",
      factura_requires_name: "To issue a factura, the client's profile needs the legal name.",
      boleta_requires_document: "Boletas over S/ 700 need the client's DNI in their profile.",
      no_amount: 'Enter the amount to invoice.',
      exchange_rate_required: "USD boletas without the client's document aren't supported yet.",
      disabled: 'Issuing is turned off in Settings > Invoicing.',
      not_completed: 'The reservation must be completed.',
      not_paid: 'Record the payment first.',
    } as Record<string, string>,
  },
}

type Invoice = {
  id: string
  docType: '01' | '03' | '07'
  serie: string
  numero: number
  status: 'pending' | 'sent' | 'accepted' | 'rejected' | 'error' | 'voided'
  environment: 'demo' | 'production'
  total: number
  currency: 'PEN' | 'USD'
  customerName: string
  pdfUrl: string | null
  relatedInvoiceId: string | null
  lastError: string | null
  sunatDescription: string | null
}

type Info = {
  available: boolean
  reason?: string
  canEmit?: boolean
  environment?: 'demo' | 'production'
  blocker?: string | null
  requestedKind?: 'boleta' | 'factura' | null
  canCancel?: boolean
  invoices?: Invoice[]
}

type Draft = {
  docType: '01' | '03'
  serie: string
  currency: 'PEN' | 'USD'
  customer: { docType: string; docNumber: string | null; name: string }
  description: string
  subtotal: number
  igv: number
  total: number
}

const money = (currency: string, n: number) => `${currency === 'USD' ? '$' : 'S/'} ${n.toFixed(2)}`

export function ReservationInvoicing({
  businessId,
  reservationId,
  // Changes when the reservation's status or payment changes, to re-check.
  refreshKey,
  onLiveInvoicesChange,
}: {
  businessId: string
  reservationId: string
  refreshKey: string
  // Tells the modal which factura/boleta are still valid (e.g. "Boleta
  // B002-1 · S/ 60.00"), so cancelling or reopening the reservation can warn
  // that the comprobante isn't voided by that.
  onLiveInvoicesChange?: (labels: string[]) => void
}) {
  const { language } = useLanguage()
  const s = STRINGS[language === 'en' ? 'en' : 'es']

  const [info, setInfo] = useState<Info | null>(null)
  const [busy, setBusy] = useState(false)
  const [composing, setComposing] = useState(false)
  const [kind, setKind] = useState<'boleta' | 'factura'>('boleta')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [voiding, setVoiding] = useState<string | null>(null)
  const [reason, setReason] = useState('01')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/invoicing/reservation?business_id=${businessId}&reservation_id=${reservationId}`)
      setInfo(res.ok ? await res.json() : { available: false })
    } catch {
      setInfo({ available: false })
    }
  }, [businessId, reservationId])

  // Another reservation: show the loading state, never the previous one's
  // comprobantes.
  useEffect(() => {
    setInfo(null)
  }, [reservationId])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  useEffect(() => {
    if (!onLiveInvoicesChange) return
    const live = (info?.invoices ?? []).filter((i) => i.docType !== '07' && !['rejected', 'voided'].includes(i.status))
    onLiveInvoicesChange(
      live.map((i) => `${i.docType === '01' ? s.factura : s.boleta} ${i.serie}-${i.numero} · ${money(i.currency, i.total)}`),
    )
  }, [info, onLiveInvoicesChange, s])

  const post = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch('/api/invoicing/reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, reservationId, ...payload }),
      })
      const json = await res.json().catch(() => ({}))
      return { ok: res.ok, json }
    },
    [businessId, reservationId],
  )

  const preview = useCallback(
    async (next: { kind: 'boleta' | 'factura'; amount: string; description: string }) => {
      const { ok, json } = await post({
        action: 'preview',
        kind: next.kind,
        amount: next.amount ? Number(next.amount) : undefined,
        description: next.description || undefined,
      })
      // Fill the editable fields from the first preview. The amount is the
      // reservation price as entered (not the total, which may add IGV).
      if (json.amount != null) setAmount((a) => a || String(json.amount))
      if (ok) {
        setDraft(json.draft)
        setDraftError(null)
        setDescription((d) => d || json.draft.description)
      } else {
        setDraft(null)
        setDraftError(s.errors[json.error] ?? json.message ?? s.generic)
      }
    },
    [post, s],
  )

  // Refresh the preview while editing (debounced).
  useEffect(() => {
    if (!composing) return
    const id = setTimeout(() => preview({ kind, amount, description }), 350)
    return () => clearTimeout(id)
  }, [composing, kind, amount, description, preview])

  function startComposing() {
    setKind(info?.requestedKind ?? 'boleta')
    setAmount('')
    setDescription('')
    setDraft(null)
    setDraftError(null)
    setComposing(true)
  }

  async function emit() {
    setBusy(true)
    try {
      const { ok, json } = await post({
        action: 'emit',
        kind,
        amount: amount ? Number(amount) : undefined,
        description: description || undefined,
      })
      if (!ok) {
        toast.error(s.errors[json.error] ?? json.message ?? s.generic)
        return
      }
      const status = json.invoice?.status
      if (status === 'accepted') toast.success(s.emitted)
      else if (status === 'rejected' || status === 'error') toast.error(json.invoice?.sunatDescription ?? json.invoice?.lastError ?? s.generic)
      else toast.message(s.sentPending)
      setComposing(false)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function act(action: 'retry' | 'credit_note', invoiceId: string) {
    setBusy(true)
    try {
      const { ok, json } = await post({ action, invoiceId, reasonCode: reason })
      if (!ok) {
        toast.error(s.errors[json.error] ?? json.message ?? s.generic)
        return
      }
      if (action === 'credit_note' && json.invoice?.status === 'accepted') toast.success(s.voided)
      setVoiding(null)
      await load()
    } finally {
      setBusy(false)
    }
  }

  // First load: hold the space with a placeholder, so an empty modal is
  // never mistaken for "this reservation has no comprobante".
  if (!info) {
    return (
      <div className="min-w-0 space-y-3 rounded-lg border p-3" aria-busy="true">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          {s.title}
        </span>
        <div className="flex items-center gap-2 rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {s.loading}
        </div>
      </div>
    )
  }

  // Set up but not usable yet: say why instead of silently hiding the
  // section. No plan access = nothing (Settings has the upsell).
  const notReady = !info.available ? info.reason : !info.canEmit && !(info.invoices ?? []).length ? 'disabled' : null
  if (notReady === 'disabled' || notReady === 'not_configured' || notReady === 'no_token') {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <Receipt className="h-4 w-4 shrink-0" />
        {s.notReady[notReady]}
      </p>
    )
  }
  if (!info.available) return null

  const invoices = info.invoices ?? []
  const hasLive = invoices.some((i) => i.docType !== '07' && !['rejected', 'voided'].includes(i.status))
  const canStart = info.canEmit && !info.blocker && !hasLive

  const label = (i: Invoice) => (i.docType === '01' ? s.factura : i.docType === '03' ? s.boleta : s.creditNote)

  return (
    // min-w-0: never wider than the modal, whatever is inside.
    <div className="min-w-0 space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          {s.title}
        </span>
        {info.environment === 'demo' && (
          <Badge variant="outline" className="gap-1 text-xs">
            <FlaskConical className="h-3 w-3" />
            {s.demo}
          </Badge>
        )}
      </div>

      {invoices.map((inv) => (
        <div key={inv.id} className="space-y-2 rounded-md bg-muted/40 p-2.5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">
              {label(inv)} <span className="font-mono">{inv.serie}-{inv.numero}</span>
              <span className="ml-2 text-muted-foreground">{money(inv.currency, inv.total)}</span>
            </span>
            <Badge
              variant={inv.status === 'accepted' ? 'default' : inv.status === 'rejected' || inv.status === 'error' ? 'destructive' : 'secondary'}
              className="gap-1"
            >
              {inv.status === 'accepted' ? (
                <Check className="h-3 w-3" />
              ) : inv.status === 'voided' ? (
                <Ban className="h-3 w-3" />
              ) : inv.status === 'rejected' || inv.status === 'error' ? (
                <AlertCircle className="h-3 w-3" />
              ) : (
                <Clock className="h-3 w-3" />
              )}
              {s.status[inv.status] ?? inv.status}
            </Badge>
          </div>
          {(inv.status === 'rejected' || inv.status === 'error') && (inv.sunatDescription || inv.lastError) && (
            <p className="text-xs text-destructive">{inv.sunatDescription || inv.lastError}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {inv.pdfUrl && (
              <Button variant="outline" size="sm" className="h-7 gap-1" asChild>
                <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer">
                  <FileText className="h-3.5 w-3.5" />
                  {s.pdf}
                </a>
              </Button>
            )}
            {['pending', 'sent', 'error'].includes(inv.status) && (
              <Button variant="outline" size="sm" className="h-7 gap-1" disabled={busy} onClick={() => act('retry', inv.id)}>
                <RotateCw className="h-3.5 w-3.5" />
                {s.retry}
              </Button>
            )}
            {info.canCancel && inv.docType !== '07' && inv.status === 'accepted' && voiding !== inv.id && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => {
                  setReason('01')
                  setVoiding(inv.id)
                }}
              >
                <Ban className="h-3.5 w-3.5" />
                {s.void}
              </Button>
            )}
          </div>
          {voiding === inv.id && (
            <div className="space-y-2 rounded-md border bg-background p-2.5">
              <p className="text-xs font-medium">{s.voidTitle}</p>
              {/* Stacked, not one row: the modal is narrow and a single row
                  pushed the whole dialog sideways. */}
              <div className="space-y-2">
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(s.reasons).map(([code, text]) => (
                      <SelectItem key={code} value={code}>
                        {text}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => setVoiding(null)}>
                    {s.cancel}
                  </Button>
                  <Button size="sm" variant="destructive" className="h-8" disabled={busy} onClick={() => act('credit_note', inv.id)}>
                    {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                    {s.voidConfirm}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      {!hasLive && info.canEmit && info.blocker && !composing && (
        <p className="text-xs text-muted-foreground">{s.needsCompletion}</p>
      )}

      {canStart && !composing && (
        <Button size="sm" className="gap-2" onClick={startComposing}>
          <Receipt className="h-4 w-4" />
          {s.emit}
        </Button>
      )}

      {composing && (
        <div className="space-y-3 rounded-md border bg-background p-3">
          <div className="flex items-center justify-between">
            <div className="inline-flex rounded-md border p-0.5">
              {(['boleta', 'factura'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    'rounded px-3 py-1 text-xs font-medium transition-colors',
                    kind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {k === 'boleta' ? s.boleta : s.factura}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setComposing(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <div className="space-y-1">
              <Label htmlFor="inv-amount" className="text-xs">
                {s.amount}
              </Label>
              <Input
                id="inv-amount"
                type="number"
                min="0"
                step="0.01"
                className="h-8"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="inv-desc" className="text-xs">
                {s.description}
              </Label>
              <Input id="inv-desc" className="h-8" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          {draftError ? (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {draftError}
            </p>
          ) : draft ? (
            <div className="space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{s.customer}</span>
                <span className="text-right">
                  {draft.customer.name}
                  {draft.customer.docNumber ? ` · ${draft.customer.docNumber}` : ` · ${s.noDocument}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{s.subtotal}</span>
                <span className="tabular-nums">{money(draft.currency, draft.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{s.igv}</span>
                <span className="tabular-nums">{money(draft.currency, draft.igv)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>{s.total}</span>
                <span className="tabular-nums">{money(draft.currency, draft.total)}</span>
              </div>
            </div>
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}

          <Button size="sm" className="w-full gap-2" disabled={busy || !draft || !!draftError} onClick={emit}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {s.confirmEmit} {draft ? `${draft.docType === '01' ? s.factura : s.boleta} · ${money(draft.currency, draft.total)}` : ''}
          </Button>
        </div>
      )}
    </div>
  )
}
