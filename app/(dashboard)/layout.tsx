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
  const { currentBusiness, loading: businessLoading } = useBusinesses()
  const router = useRouter()

  const needsPlanSelection =
    !authLoading &&
    !businessLoading &&
    profile?.requires_plan_selection === true &&
    currentBusiness?.role === 'owner'

  useEffect(() => {
    if (needsPlanSelection) router.replace('/onboarding/plan')
  }, [needsPlanSelection, router])

  if (needsPlanSelection) {
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
