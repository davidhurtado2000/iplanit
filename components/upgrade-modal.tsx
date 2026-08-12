'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Check,
  Crown,
  Loader2,
  BarChart3,
  Users,
  Clock,
  Layers,
  UserPlus,
  Repeat,
  FileSpreadsheet,
  Headphones,
} from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { useBusinesses } from '@/hooks/use-businesses'
import { FREE_LIMITS } from '@/lib/plan-limits'
import { cn } from '@/lib/utils'

// Provisional prices for every business regardless of country - David still
// wants to discuss country-based pricing with his co-founder before
// finalizing that, so this intentionally isn't split by business.country
// yet (unlike SALES_WHATSAPP below, which was already confirmed).
const PRO_PRICE_USD = 25
const PREMIUM_PRICE_USD = 40

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
  feature?: string
  // Unset = generic "you hit a Free-tier limit" framing, both cards shown
  // equally. 'premium' = opened from a Premium-only gate (e.g. Analytics) -
  // Premium card is emphasized and the Pro card notes the feature isn't
  // included there. 'pro' = opened from a Pro-or-above gate (e.g. Team).
  requiredPlan?: 'pro' | 'premium'
}

// Routed by the business's own country so a US business's WhatsApp reaches
// the Colorado number and everyone else reaches the Peru number - matches
// the country-based sales conversation, not just the country-based currency
// default (see scripts/046).
const SALES_WHATSAPP = {
  US: '17205469411',
  default: '51983720200',
}
const SALES_EMAIL = 'davidsoftwareservicesllc@gmail.com'

export function UpgradeModal({ isOpen, onClose, feature, requiredPlan }: UpgradeModalProps) {
  const { t } = useLanguage()
  const { currentBusiness } = useBusinesses()
  const m = t.upgradeModal
  const [loadingTier, setLoadingTier] = useState<'pro' | 'premium' | null>(null)
  const [checkoutError, setCheckoutError] = useState('')

  const PRO_FEATURES = [
    { icon: Clock, title: m.featureUnlimitedTitle, description: m.featureUnlimitedDesc },
    { icon: Layers, title: m.featureProCapTitle, description: m.featureProCapDesc },
    { icon: UserPlus, title: m.featureProSeatsTitle, description: m.featureProSeatsDesc },
    { icon: Repeat, title: m.featureProRecurringTitle, description: m.featureProRecurringDesc },
  ]

  const PREMIUM_FEATURES = [
    { icon: BarChart3, title: m.featureAnalyticsTitle, description: m.featureAnalyticsDesc },
    { icon: Users, title: m.featureClientHistoryTitle, description: m.featureClientHistoryDesc },
    { icon: Layers, title: m.featureUnlimitedRecordsTitle, description: m.featureUnlimitedRecordsDesc },
    { icon: FileSpreadsheet, title: m.featureCsvTitle, description: m.featureCsvDesc },
    { icon: Headphones, title: m.featurePrioritySupportTitle, description: m.featurePrioritySupportDesc },
  ]

  const handleSubscribe = async (tier: 'pro' | 'premium') => {
    setCheckoutError('')
    setLoadingTier(tier)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
        return
      }
      setCheckoutError(m.checkoutError)
    } catch (err) {
      console.error('[iplanit] Error starting checkout:', err)
      setCheckoutError(m.checkoutError)
    } finally {
      setLoadingTier(null)
    }
  }

  const handleContactUs = () => {
    window.open(
      `mailto:${SALES_EMAIL}?subject=Solicitud%20de%20Plan%20iPlanit&body=Hola,%20me%20interesa%20actualizar%20mi%20plan.`,
      '_blank'
    )
  }

  const handleWhatsApp = () => {
    const number = currentBusiness?.country === 'US' ? SALES_WHATSAPP.US : SALES_WHATSAPP.default
    window.open(
      `https://wa.me/${number}?text=Hola,%20me%20interesa%20actualizar%20mi%20plan%20de%20iPlanit`,
      '_blank'
    )
  }

  const description =
    requiredPlan === 'premium' && feature
      ? m.descFeaturePremium.replace('{feature}', feature)
      : requiredPlan === 'pro' && feature
        ? m.descFeaturePro.replace('{feature}', feature)
        : feature
          ? m.descGenericWithFeature.replace('{feature}', feature)
          : m.descGeneric

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500">
            <Crown className="h-7 w-7 text-white" />
          </div>
          <DialogTitle className="text-center text-xl">{m.title}</DialogTitle>
          <DialogDescription className="text-center">{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Pro card */}
            <div
              className={cn(
                'flex flex-col gap-4 rounded-xl border-2 p-4 sm:p-5',
                requiredPlan === 'premium' ? 'border-border' : 'border-primary/30 bg-primary/5'
              )}
            >
              <div>
                <p className="text-sm font-semibold text-foreground">{m.proTitle}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-foreground sm:text-3xl">${PRO_PRICE_USD}</span>
                  <span className="text-xs text-muted-foreground sm:text-sm">{m.perMonth}</span>
                </div>
              </div>
              <div className="space-y-2.5">
                {PRO_FEATURES.map((f) => (
                  <div key={f.title} className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                      <Check className="h-2.5 w-2.5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-foreground">{f.title}</p>
                      <p className="text-xs text-muted-foreground">{f.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              {requiredPlan === 'premium' && feature && (
                <p className="text-xs italic text-muted-foreground">
                  {m.proFeatureNotIncluded.replace('{feature}', feature)}
                </p>
              )}
              <div className="mt-auto border-t pt-4">
                <Button
                  className="w-full gap-2 px-6 has-[>svg]:px-6"
                  variant={requiredPlan === 'premium' ? 'outline' : 'default'}
                  onClick={() => handleSubscribe('pro')}
                  disabled={loadingTier !== null}
                >
                  {loadingTier === 'pro' && <Loader2 className="h-4 w-4 animate-spin" />}
                  {m.subscribeProBtn}
                </Button>
              </div>
            </div>

            {/* Premium card */}
            <div
              className={cn(
                'flex flex-col gap-4 rounded-xl border-2 p-4 sm:p-5',
                requiredPlan === 'pro' ? 'border-border' : 'border-amber-400/60 bg-amber-500/5'
              )}
            >
              <div>
                <p className="text-sm font-semibold text-foreground">{m.premiumTitle}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-foreground sm:text-3xl">${PREMIUM_PRICE_USD}</span>
                  <span className="text-xs text-muted-foreground sm:text-sm">{m.perMonth}</span>
                </div>
              </div>
              <p className="border-t pt-3 text-sm font-semibold text-foreground">{m.premiumIncludesProLabel}</p>
              <div className="space-y-2.5">
                {PREMIUM_FEATURES.map((f) => (
                  <div key={f.title} className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                      <Check className="h-2.5 w-2.5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-foreground">{f.title}</p>
                      <p className="text-xs text-muted-foreground">{f.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-auto border-t pt-4">
                <Button
                  className="w-full gap-2 px-6 has-[>svg]:px-6 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600"
                  onClick={() => handleSubscribe('premium')}
                  disabled={loadingTier !== null}
                >
                  {loadingTier === 'premium' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Crown className="h-4 w-4" />
                  )}
                  {m.subscribePremiumBtn}
                </Button>
              </div>
            </div>
          </div>

          {checkoutError && <p className="text-center text-xs text-destructive">{checkoutError}</p>}

          {/* Free Plan Limits Info */}
          <div className="rounded-lg bg-muted/50 p-3 sm:p-4">
            <p className="mb-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide sm:text-xs">
              {m.freeLimitsTitle}
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{m.reservationsPerMonthLabel}</span>
                <span className="font-medium">{FREE_LIMITS.reservationsPerMonth}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{m.clientsLabel}</span>
                <span className="font-medium">{FREE_LIMITS.clients}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{m.servicesLabel}</span>
                <span className="font-medium">{FREE_LIMITS.services}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{m.resourcesLabel}</span>
                <span className="font-medium">{FREE_LIMITS.resources}</span>
              </div>
            </div>
          </div>

          <p className="text-center text-[10px] text-muted-foreground sm:text-xs">{m.activationNote}</p>
          <div className="flex items-center justify-center gap-3 border-t pt-3 text-xs text-muted-foreground">
            <span>{m.questionsBeforePay}</span>
            <button type="button" onClick={handleWhatsApp} className="underline hover:text-foreground">
              WhatsApp
            </button>
            <span>·</span>
            <button type="button" onClick={handleContactUs} className="underline hover:text-foreground">
              {m.contactEmail}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
