'use client'

import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLanguage } from '@/context/language-context'

// Memoized at module scope like getStripeClient() on the server side -
// loadStripe() should only ever be called once per publishable key. Exported
// so UpgradeModal can reuse the same instance for the follow-up
// confirmCardPayment() some cards need after subscribe/route.ts creates the
// subscription (see the 'requiresAction' branch there) - that confirmation
// targets an existing PaymentIntent by client_secret, so it doesn't need to
// happen inside this file's <Elements> form.
export const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null

interface CheckoutFormProps {
  clientSecret: string
  submitting: boolean
  onPaymentMethodReady: (paymentMethodId: string) => void
  onError: (message: string) => void
}

function InnerForm({ submitting, onPaymentMethodReady, onError }: Omit<CheckoutFormProps, 'clientSecret'>) {
  const stripe = useStripe()
  const elements = useElements()
  const { t } = useLanguage()
  const m = t.upgradeModal
  const [confirming, setConfirming] = useState(false)
  // PaymentElement's own billingDetails.name field decides on its own
  // whether to render (it didn't, in practice) - collecting it ourselves as
  // a plain input guarantees it's always there, matching the "Cardholder
  // name" field the old hosted Checkout page always showed.
  const [cardholderName, setCardholderName] = useState('')

  const handleSubmit = async () => {
    if (!stripe || !elements) return
    setConfirming(true)
    // redirect: 'if_required' keeps card-only 3D Secure challenges inside
    // this same dialog (an in-page modal) instead of a full page redirect -
    // only some non-card methods would actually need `return_url`, and this
    // form is scoped to cards only (see the plan's scope decision).
    // No `checkout=success` param here on purpose - if a bank forces a full
    // redirect for 3D Secure, the interruption means /api/stripe/subscribe
    // never got called yet, so nothing was actually created. Landing back
    // on a plain settings URL avoids falsely telling the user it worked.
    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
      confirmParams: {
        return_url: `${window.location.origin}/dashboard/settings`,
        payment_method_data: {
          billing_details: { name: cardholderName },
        },
      },
    })
    setConfirming(false)

    if (error) {
      onError(error.message || m.cardStepGenericError)
      return
    }
    const pm = setupIntent?.payment_method
    const pmId = typeof pm === 'string' ? pm : pm?.id
    if (!pmId) {
      onError(m.cardStepGenericError)
      return
    }
    onPaymentMethodReady(pmId)
  }

  const busy = confirming || submitting

  return (
    <div className="space-y-5">
      {/* bg-white/text-black on the wrapper, not just the input - Stripe's
          own card fields render as white regardless of the app's dark
          theme, so a theme-following dark input right above them read as a
          disconnected, easy-to-miss element rather than part of the same
          form. Matching Stripe's own styling here makes it one visually
          continuous card-details block. */}
      <div className="space-y-4 rounded-xl border bg-white p-4 text-black shadow-sm">
        <div className="space-y-1.5">
          <Label htmlFor="cardholder-name" className="text-black">
            {m.cardholderNameLabel}
          </Label>
          <Input
            id="cardholder-name"
            value={cardholderName}
            onChange={(e) => setCardholderName(e.target.value)}
            placeholder={m.cardholderNamePlaceholder}
            autoComplete="cc-name"
            className="border-gray-300 bg-white text-black placeholder:text-gray-400 dark:bg-white"
          />
        </div>
        {/* Apple Pay / Google Pay ride on the SetupIntent's existing 'card'
            payment_method_type under the hood (they're wallets around a
            card, not a separate type) - so unlike Cash App/Bank, they don't
            need any backend change, just showing the Express Checkout
            buttons here. wallets.link: 'never' turns off Link's own
            "Bank · $5 back" promo row - that's Stripe's own Link product
            upselling itself, unrelated to payment_method_types. */}
        <PaymentElement
          options={{ paymentMethodOrder: ['card'], wallets: { applePay: 'auto', googlePay: 'auto', link: 'never' } }}
        />
      </div>
      <Button
        className="w-full gap-2"
        size="lg"
        onClick={handleSubmit}
        disabled={!stripe || busy || !cardholderName.trim()}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {m.cardStepSubmit}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" />
        {m.cardStepSecureNote}
      </p>
    </div>
  )
}

export function CheckoutForm({ clientSecret, submitting, onPaymentMethodReady, onError }: CheckoutFormProps) {
  const { language, t } = useLanguage()

  if (!stripePromise) {
    return <p className="text-sm text-destructive">{t.upgradeModal.cardStepGenericError}</p>
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, locale: language === 'es' ? 'es' : 'en' }}>
      <InnerForm submitting={submitting} onPaymentMethodReady={onPaymentMethodReady} onError={onError} />
    </Elements>
  )
}
