'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Crown,
  Gift,
  Loader2,
  PartyPopper,
  Sparkles,
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
import { useAuth } from '@/hooks/use-auth'
import { useBusinesses } from '@/hooks/use-businesses'
import { FREE_LIMITS } from '@/lib/plan-limits'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { CheckoutForm, stripePromise } from '@/components/checkout-form'
import { playSuccessChime } from '@/lib/notification-sound'

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

// Embedded flow (Stripe Elements) instead of a hosted-Checkout redirect -
// this is what lets 'confirm' below exist at all: the card is identified via
// /api/stripe/setup-intent + /api/stripe/subscribe BEFORE any subscription
// or charge is created, so a reused-trial card can be flagged and confirmed
// with the user first instead of silently charging and explaining after
// the fact (see app/api/stripe/subscribe/route.ts and the memory note on
// this - a real gap found while testing the old hosted-Checkout flow).
type Step = 'plans' | 'card' | 'confirm' | 'success'

export function UpgradeModal({ isOpen, onClose, feature, requiredPlan }: UpgradeModalProps) {
  const { t, language } = useLanguage()
  const router = useRouter()
  const { user, refreshProfile } = useAuth()
  const { currentBusiness } = useBusinesses()
  const m = t.upgradeModal
  const [loadingTier, setLoadingTier] = useState<'pro' | 'premium' | null>(null)
  const [checkoutError, setCheckoutError] = useState('')
  const [trialEligible, setTrialEligible] = useState(false)

  const [step, setStep] = useState<Step>('plans')
  const [selectedTier, setSelectedTier] = useState<'pro' | 'premium' | null>(null)
  const [clientSecret, setClientSecret] = useState('')
  const [cardError, setCardError] = useState('')
  const [subscribing, setSubscribing] = useState(false)
  const [pendingPaymentMethodId, setPendingPaymentMethodId] = useState('')
  const [confirmPriceUsd, setConfirmPriceUsd] = useState(0)

  const resetFlow = () => {
    setStep('plans')
    setSelectedTier(null)
    setClientSecret('')
    setCardError('')
    setPendingPaymentMethodId('')
    setConfirmPriceUsd(0)
  }

  const handleClose = () => {
    resetFlow()
    onClose()
  }

  useEffect(() => {
    if (!isOpen || !user?.email) return
    let cancelled = false
    createClient()
      .rpc('has_used_trial', { p_email: user.email })
      .then(({ data }) => {
        if (!cancelled) setTrialEligible(data === false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, user?.email])

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
      const res = await fetch('/api/stripe/setup-intent', { method: 'POST' })
      const data = await res.json()
      if (data.clientSecret) {
        setSelectedTier(tier)
        setClientSecret(data.clientSecret)
        setStep('card')
      } else {
        setCheckoutError(m.checkoutError)
      }
    } catch (err) {
      console.error('[iplanit] Error starting setup intent:', err)
      setCheckoutError(m.checkoutError)
    } finally {
      setLoadingTier(null)
    }
  }

  // profiles.plan may land a moment after this returns (either immediately,
  // or via the webhook once a follow-up SCA confirmation completes) -
  // refreshProfile() now plus a delayed retry, same pattern already used in
  // Settings' handleChangePlan for the exact same race. Shows a proper
  // success screen instead of a toast - a corner notification is easy to
  // miss right after paying, this stays on screen until they act on it.
  const finishSuccessfully = async () => {
    await refreshProfile()
    setTimeout(() => refreshProfile(), 2000)
    setStep('success')
    playSuccessChime()
  }

  const handleGoToDashboard = () => {
    handleClose()
    router.push('/dashboard')
  }

  const submitSubscription = async (paymentMethodId: string, confirmed: boolean) => {
    setSubscribing(true)
    setCardError('')
    try {
      const res = await fetch('/api/stripe/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: selectedTier, payment_method_id: paymentMethodId, confirmed }),
      })
      const data = await res.json()

      if (data.needsConfirmation) {
        setPendingPaymentMethodId(paymentMethodId)
        setConfirmPriceUsd(data.priceUsd)
        setStep('confirm')
        return
      }

      if (data.requiresAction) {
        // Some cards demand a second SCA challenge for the actual charge,
        // separate from the one already passed when the card was saved
        // (see app/api/stripe/subscribe/route.ts). This confirms an
        // existing PaymentIntent by client_secret, so it doesn't need the
        // <Elements> form context - a fresh stripe.js instance is enough.
        const stripe = await stripePromise
        if (!stripe) {
          setCardError(m.cardStepGenericError)
          return
        }
        const { error, paymentIntent } = await stripe.confirmCardPayment(data.clientSecret)
        if (error || paymentIntent?.status !== 'succeeded') {
          setCardError(error?.message || m.cardStepGenericError)
          return
        }
        await finishSuccessfully()
        return
      }

      if (data.success) {
        await finishSuccessfully()
        return
      }
      setCardError(m.cardStepGenericError)
    } catch (err) {
      console.error('[iplanit] Error confirming subscription:', err)
      setCardError(m.cardStepGenericError)
    } finally {
      setSubscribing(false)
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-2xl">
        {step === 'plans' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500">
                <Crown className="h-7 w-7 text-white" />
              </div>
              <DialogTitle className="text-center text-xl">{m.title}</DialogTitle>
              <DialogDescription className="text-center">{description}</DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {trialEligible && (
                <div className="mx-auto flex w-fit items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm">
                  <Gift className="h-3.5 w-3.5" />
                  {m.trialPromoBanner}
                </div>
              )}

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
                    {trialEligible && (
                      <p className="text-xs font-medium text-amber-600 dark:text-amber-400">{m.trialBadge}</p>
                    )}
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
                    {trialEligible && (
                      <p className="text-xs font-medium text-amber-600 dark:text-amber-400">{m.trialBadge}</p>
                    )}
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

              {trialEligible && (
                <p className="text-center text-[10px] text-muted-foreground sm:text-xs">{m.trialNote}</p>
              )}
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
          </>
        )}

        {step === 'card' && clientSecret && (
          <>
            <DialogHeader>
              <button
                type="button"
                onClick={() => setStep('plans')}
                className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {m.cardStepBack}
              </button>
              <DialogTitle className="text-xl">{m.cardStepTitle}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {cardError && <p className="text-sm text-destructive">{cardError}</p>}

              {/* SetupIntent has no amount of its own to display (it only
                  saves the card, doesn't charge yet) - unlike the old
                  hosted-Checkout page, this screen otherwise shows no price,
                  currency, or trial info at all, which is exactly what
                  David flagged after testing: it named a price but never
                  said "free" or gave an actual charge date. Grouped into one
                  highlighted card (instead of scattered plain-text lines)
                  so it reads as one clear statement of what's about to
                  happen, not an afterthought. Replaces the PEN/USD "Adaptive
                  Pricing" toggle the hosted page used to show - the actual
                  charge was always USD either way (that's the currency
                  baked into the Stripe Price itself), the toggle was only
                  ever a display convenience, never a real payment-currency
                  choice. */}
              <div
                className={cn(
                  'rounded-xl border p-4',
                  trialEligible ? 'border-primary/30 bg-primary/5' : 'bg-muted/40'
                )}
              >
                <p className="text-sm font-medium text-foreground">
                  {trialEligible
                    ? m.cardStepTrialNote
                        .replace('{plan}', selectedTier === 'premium' ? m.premiumTitle : m.proTitle)
                        .replace('{price}', `$${selectedTier === 'premium' ? PREMIUM_PRICE_USD : PRO_PRICE_USD} USD`)
                        .replace(
                          '{date}',
                          new Intl.DateTimeFormat(language === 'es' ? 'es-PE' : 'en-US', { dateStyle: 'long' }).format(
                            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                          )
                        )
                    : m.cardStepChargeTodayNote
                        .replace('{plan}', selectedTier === 'premium' ? m.premiumTitle : m.proTitle)
                        .replace('{price}', `$${selectedTier === 'premium' ? PREMIUM_PRICE_USD : PRO_PRICE_USD} USD`)}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">{m.cardStepCurrencyNote}</p>
              </div>

              <CheckoutForm
                clientSecret={clientSecret}
                submitting={subscribing}
                onPaymentMethodReady={(pmId) => submitSubscription(pmId, false)}
                onError={setCardError}
              />

              <p className="text-center text-xs text-muted-foreground">
                {m.cardStepLegalPrefix}{' '}
                <Link href="/terms" target="_blank" className="underline hover:text-foreground">
                  {t.legalTerms}
                </Link>{' '}
                {m.cardStepLegalAnd}{' '}
                <Link href="/privacy" target="_blank" className="underline hover:text-foreground">
                  {t.legalPrivacy}
                </Link>
                .
              </p>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">{m.confirmChargeTitle}</DialogTitle>
              <DialogDescription>
                {m.confirmChargeBody.replace('{price}', `$${confirmPriceUsd}`)}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-3 py-4">
              <Button variant="outline" onClick={handleClose} disabled={subscribing}>
                {m.confirmChargeCancel}
              </Button>
              <Button
                className="gap-2"
                onClick={() => submitSubscription(pendingPaymentMethodId, true)}
                disabled={subscribing}
              >
                {subscribing && <Loader2 className="h-4 w-4 animate-spin" />}
                {m.confirmChargeContinue}
              </Button>
            </div>
          </>
        )}

        {step === 'success' && (
          <div className="flex flex-col items-center gap-5 px-2 py-6 text-center">
            {/* Primary blue (not the amber/orange used for upsell CTAs
                elsewhere) - this moment is "welcome to the product," so it
                ties to iPlanit's own brand color (--primary, also the
                #2563eb used in email headers) rather than the generic
                upgrade-nag palette. */}
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary">
              <PartyPopper className="h-8 w-8 text-primary-foreground" />
              <Sparkles className="absolute -top-2 -right-2 h-5 w-5 text-amber-400" />
              <Sparkles className="absolute -bottom-1 -left-3 h-4 w-4 text-amber-400" />
            </div>
            <div className="space-y-2">
              <DialogTitle className="text-2xl">
                {m.successTitle.replace('{plan}', selectedTier === 'premium' ? m.premiumTitle : m.proTitle)}
              </DialogTitle>
              <DialogDescription className="text-sm">{m.successBody}</DialogDescription>
            </div>
            <Button size="lg" className="w-full max-w-xs gap-2" onClick={handleGoToDashboard}>
              {m.successCta}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
