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
import { Check, Crown, Loader2, BarChart3, Users, Clock, Mail, Layers } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { useBusinesses } from '@/hooks/use-businesses'
import { FREE_LIMITS } from '@/lib/plan-limits'

// Provisional flat price for every business regardless of country - David
// still wants to discuss country-based pricing with his co-founder before
// finalizing that, so this intentionally isn't split by business.country
// yet (unlike SALES_WHATSAPP below, which was already confirmed).
const PREMIUM_PRICE_USD = 35

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
  feature?: string
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

export function UpgradeModal({ isOpen, onClose, feature }: UpgradeModalProps) {
  const { t } = useLanguage()
  const { currentBusiness } = useBusinesses()
  const m = t.upgradeModal
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')

  const PREMIUM_FEATURES = [
    { icon: BarChart3, title: m.featureAnalyticsTitle, description: m.featureAnalyticsDesc },
    { icon: Users, title: m.featureClientHistoryTitle, description: m.featureClientHistoryDesc },
    { icon: Clock, title: m.featureUnlimitedTitle, description: m.featureUnlimitedDesc },
    { icon: Layers, title: m.featureUnlimitedRecordsTitle, description: m.featureUnlimitedRecordsDesc },
    { icon: Mail, title: m.featureNotificationsTitle, description: m.featureNotificationsDesc },
  ]

  const handleSubscribe = async () => {
    setCheckoutError('')
    setIsRedirecting(true)
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
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
      setIsRedirecting(false)
    }
  }

  const handleContactUs = () => {
    window.open(
      `mailto:${SALES_EMAIL}?subject=Solicitud%20de%20Plan%20Premium&body=Hola,%20me%20interesa%20actualizar%20a%20Premium.`,
      '_blank'
    )
  }

  const handleWhatsApp = () => {
    const number = currentBusiness?.country === 'US' ? SALES_WHATSAPP.US : SALES_WHATSAPP.default
    window.open(
      `https://wa.me/${number}?text=Hola,%20me%20interesa%20el%20Plan%20Premium%20de%20iPlanit`,
      '_blank'
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500">
            <Crown className="h-7 w-7 text-white" />
          </div>
          <DialogTitle className="text-center text-xl">
            {m.title}
          </DialogTitle>
          <DialogDescription className="text-center">
            {feature ? m.descFeature.replace('{feature}', feature) : m.descGeneric}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Pricing */}
          <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 text-center sm:p-6">
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-3xl font-bold text-foreground sm:text-4xl">${PREMIUM_PRICE_USD}</span>
              <span className="text-muted-foreground text-sm sm:text-base">{m.perMonth}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              {m.monthlyBilling}
            </p>
          </div>

          {/* Features */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-foreground sm:text-sm">
              {m.includesFree}
            </p>
            {PREMIUM_FEATURES.map((feature) => (
              <div key={feature.title} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground sm:text-sm">
                    {feature.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

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

          {/* CTA Buttons */}
          <div className="space-y-3">
            <Button
              className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600"
              size="lg"
              onClick={handleSubscribe}
              disabled={isRedirecting}
            >
              {isRedirecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
              {m.subscribeBtn}
            </Button>
            {checkoutError && (
              <p className="text-center text-xs text-destructive">{checkoutError}</p>
            )}
            <p className="text-center text-[10px] text-muted-foreground sm:text-xs">
              {m.activationNote}
            </p>
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
