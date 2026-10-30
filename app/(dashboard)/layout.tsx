'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { MobileNav } from '@/components/dashboard/mobile-nav'
import { FeedbackWidget } from '@/components/dashboard/feedback-widget'
import { PlanUsageBanner } from '@/components/dashboard/plan-usage-banner'
import { PageTransition } from '@/components/dashboard/page-transition'
import { Toaster } from '@/components/ui/sonner'
import { LogoLoader } from '@/components/logo-loader'
import { BusinessProvider } from '@/context/business-context'
import { DashboardDataProvider } from '@/context/dashboard-data-context'
import { NotificationsProvider } from '@/context/notifications-context'
import { useAuth } from '@/hooks/use-auth'
import { useBusinesses } from '@/hooks/use-businesses'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

// Phase 4 of the pricing overhaul (scripts/092-plan-onboarding-gate.sql):
// a signup that hasn't picked a plan yet can't see any dashboard page
// until it does. Only applies to the business OWNER - a "skip business"
// signup (joining someone else's business later as staff, see
// app/(auth)/register/page.tsx's handleSkipBusiness) has no business of
// their own to attach a plan to, and neither does an existing staff
// member whose own profile.plan is separately irrelevant. Needs
// useBusinesses() to know that, so this has to live INSIDE
// BusinessProvider, not alongside it - a sibling check couldn't see
// currentBusiness at all.
function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { profile, loading: authLoading } = useAuth()
  const { businesses, currentBusiness, loading: businessLoading } = useBusinesses()
  const router = useRouter()

  const loaded = !authLoading && !businessLoading
  const needsPlanSelection = loaded && profile?.requires_plan_selection === true && currentBusiness?.role === 'owner'

  // Worker accounts (scripts/104) go to their read-only portal instead of
  // the dashboard when the dashboard has nothing usable for them: no
  // business of their own, OR one that never picked a plan (e.g. a barber
  // who once tried iPlanit on their own, then got invited by their shop -
  // forcing them through plan selection to see their own agenda would be
  // wrong). Checked only in those two cases, so active owners/admins/sales
  // pay no extra query; an active owner who is ALSO someone's worker keeps
  // the dashboard and reaches Mi agenda from the sidebar instead.
  const needsWorkerCheck = loaded && (businesses.length === 0 || needsPlanSelection)
  const [workerCheck, setWorkerCheck] = useState<'idle' | 'checking' | 'worker' | 'none'>('idle')
  useEffect(() => {
    if (!needsWorkerCheck || workerCheck !== 'idle') return
    setWorkerCheck('checking')
    createClient()
      .rpc('get_my_worker_links')
      .then(({ data }) => {
        setWorkerCheck(Array.isArray(data) && data.length > 0 ? 'worker' : 'none')
      })
  }, [needsWorkerCheck, workerCheck])

  useEffect(() => {
    if (workerCheck === 'worker') router.replace('/mi-agenda')
    else if (workerCheck === 'none' && needsPlanSelection) router.replace('/onboarding/plan')
  }, [workerCheck, needsPlanSelection, router])

  if (needsPlanSelection || (needsWorkerCheck && workerCheck !== 'none')) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LogoLoader />
      </div>
    )
  }

  return <>{children}</>
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  return (
    <BusinessProvider>
    <DashboardDataProvider>
    <NotificationsProvider>
    <OnboardingGate>
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar - hidden on mobile */}
      <div className="hidden lg:block">
        <Sidebar isCollapsed={isCollapsed} onToggle={() => setIsCollapsed(!isCollapsed)} />
      </div>

      {/* Mobile Navigation */}
      <MobileNav isOpen={isMobileOpen} onToggle={() => setIsMobileOpen(!isMobileOpen)} />

      {/* Main Content */}
      <main
        className={cn(
          'transition-all duration-300 pt-14 lg:pt-0',
          isCollapsed ? 'lg:ml-16' : 'lg:ml-64'
        )}
      >
        <div className="mx-auto max-w-[1600px] p-4 sm:p-6">
          <PlanUsageBanner />
          <PageTransition>{children}</PageTransition>
        </div>
      </main>

      <FeedbackWidget />
      <Toaster position="top-right" />
    </div>
    </OnboardingGate>
    </NotificationsProvider>
    </DashboardDataProvider>
    </BusinessProvider>
  )
}
