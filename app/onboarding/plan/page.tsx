'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useLanguage } from '@/context/language-context'
import { BusinessProvider } from '@/context/business-context'
import { UpgradeModal } from '@/components/upgrade-modal'

// Phase 4 of the pricing overhaul (scripts/092-plan-onboarding-gate.sql):
// a brand-new signup lands here - not straight into /dashboard - right
// after creating their account and business, and can't get past it
// without picking a plan and starting a trial. app/(dashboard)/layout.tsx
// is what actually enforces this (redirects here whenever
// profile.requires_plan_selection is true); this page is just the step
// itself, plus a safety net redirect in both directions in case someone
// lands here directly by URL.
//
// Reuses UpgradeModal exactly as-is (same Stripe Elements flow already
// proven for in-app upgrades) rendered permanently open on a plain page
// instead of as a dismissible dialog - onClose is a no-op since this step
// isn't skippable, but its own success screen's "Go to dashboard" button
// still navigates normally once a plan is actually chosen.
//
// UpgradeModal calls useBusinesses() internally (to resolve the caller's
// real plan tier through the business owner) - this route sits OUTSIDE
// app/(dashboard)/layout.tsx (deliberately, so the dashboard chrome never
// renders here), so it never inherits that layout's BusinessProvider the
// way every other UpgradeModal usage in the app does. Without this
// wrapper, mounting UpgradeModal here throws "useBusinessContext must be
// used within BusinessProvider" (found live 2026-09-21).
export default function OnboardingPlanPage() {
  return (
    <BusinessProvider>
      <OnboardingPlanContent />
    </BusinessProvider>
  )
}

function OnboardingPlanContent() {
  const { user, profile, loading, signOut } = useAuth()
  const router = useRouter()
  const { t } = useLanguage()

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.replace('/login')
      return
    }
    // Already picked a plan (or never needed to, e.g. an account created
    // before this shipped) - nothing to do here.
    if (profile && !profile.requires_plan_selection) {
      router.replace('/dashboard')
    }
  }, [loading, user, profile, router])

  if (loading || !user || !profile || !profile.requires_plan_selection) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-4 py-12">
      <button
        type="button"
        onClick={signOut}
        className="absolute right-4 top-4 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {t.signOut}
      </button>
      <div className="flex items-center gap-2">
        <img src="/favicon-96x96.png" alt="" className="h-9 w-9" />
        <img src="/logotipo_modolight.png" alt="iPlanit" className="h-7 w-auto dark:hidden" />
        <img src="/logotipo_mododark.png" alt="iPlanit" className="hidden h-7 w-auto dark:block" />
      </div>
      <div className="text-center">
        <h1 className="text-xl font-bold text-foreground">{t.onboardingPlan.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.onboardingPlan.subtitle}</p>
      </div>
      <UpgradeModal isOpen onClose={() => {}} isOnboarding />
    </div>
  )
}
