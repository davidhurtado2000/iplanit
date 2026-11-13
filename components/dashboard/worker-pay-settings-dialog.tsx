'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useBusinesses } from '@/hooks/use-businesses'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'

// Business-wide worker pay rules (scripts/114-worker-pay.sql): tip split,
// IGV handling, and whether workers see the full amount charged. Each
// worker's own commission % lives on the worker (Equipo -> editar).
// businesses RLS only lets the owner update, so admins see it read-only.
export function WorkerPaySettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { currentBusiness, updateBusiness } = useBusinesses()
  const { t } = useLanguage()
  const tr = t.pay
  const isOwner = currentBusiness?.role === 'owner'
  const isPeru = currentBusiness?.country === 'PE'

  const [tipPct, setTipPct] = useState('100')
  const [excludesTax, setExcludesTax] = useState(false)
  const [seeSales, setSeeSales] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !currentBusiness) return
    setTipPct(String(currentBusiness.tip_worker_pct ?? 100))
    setExcludesTax(Boolean(currentBusiness.pay_excludes_tax))
    setSeeSales(Boolean(currentBusiness.workers_see_sales))
  }, [open, currentBusiness])

  const tipNum = Number(tipPct.replace(',', '.'))
  const tipInvalid = tipPct.trim() === '' || !Number.isFinite(tipNum) || tipNum < 0 || tipNum > 100

  const handleSave = async () => {
    if (!currentBusiness || tipInvalid) return
    setSaving(true)
    try {
      await updateBusiness(currentBusiness.id, {
        tip_worker_pct: Math.round(tipNum * 100) / 100,
        pay_excludes_tax: isPeru ? excludesTax : false,
        workers_see_sales: seeSales,
      })
      toast.success(tr.saved)
      onOpenChange(false)
    } catch (error) {
      console.error('[iplanit] Error saving worker pay settings:', error)
      toast.error(t.saveError)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tr.settingsTitle}</DialogTitle>
          <DialogDescription>{tr.settingsDesc}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="tip-worker-pct">{tr.tipPctLabel}</Label>
            <div className="relative w-28">
              <Input
                id="tip-worker-pct"
                inputMode="decimal"
                value={tipPct}
                disabled={!isOwner}
                onChange={(e) => setTipPct(e.target.value.replace(/[^\d.,]/g, ''))}
                aria-invalid={tipInvalid || undefined}
                className={cn('pr-8', tipInvalid && 'border-destructive focus-visible:ring-destructive')}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
            <p className={cn('text-xs', tipInvalid ? 'text-destructive' : 'text-muted-foreground')}>
              {tipInvalid ? tr.invalidPct : tr.tipPctHint}
            </p>
          </div>

          {isPeru && (
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="pay-excludes-tax">{tr.excludesTaxLabel}</Label>
                <p className="text-xs text-muted-foreground">{tr.excludesTaxHint}</p>
              </div>
              <Switch id="pay-excludes-tax" checked={excludesTax} onCheckedChange={setExcludesTax} disabled={!isOwner} />
            </div>
          )}

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="workers-see-sales">{tr.seeSalesLabel}</Label>
              <p className="text-xs text-muted-foreground">{tr.seeSalesHint}</p>
            </div>
            <Switch id="workers-see-sales" checked={seeSales} onCheckedChange={setSeeSales} disabled={!isOwner} />
          </div>

          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            {isOwner ? tr.changesNote : tr.ownerOnly}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t.services.cancelBtn}
          </Button>
          {isOwner && (
            <Button onClick={handleSave} disabled={saving || tipInvalid}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t.services.saveBtn}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
