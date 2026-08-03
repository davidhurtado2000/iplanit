'use client'

import React, { useState } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { MobileNav } from '@/components/dashboard/mobile-nav'
import { FeedbackWidget } from '@/components/dashboard/feedback-widget'
import { DeletionScheduledScreen } from '@/components/dashboard/deletion-scheduled-screen'
import { Toaster } from '@/components/ui/sonner'
import { BusinessProvider } from '@/context/business-context'
import { DashboardDataProvider } from '@/context/dashboard-data-context'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const { profile } = useAuth()

  // Blocks the entire dashboard (not just Settings) so a scheduled deletion
  // can't be missed by staying on whatever page was last open - see
  // components/dashboard/deletion-scheduled-screen.tsx.
  if (profile?.deletion_requested_at) {
    return <DeletionScheduledScreen deletionRequestedAt={profile.deletion_requested_at} />
  }

  return (
    <BusinessProvider>
    <DashboardDataProvider>
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
        <div className="p-4 sm:p-6">{children}</div>
      </main>

      <FeedbackWidget />
      <Toaster position="top-right" />
    </div>
    </DashboardDataProvider>
    </BusinessProvider>
  )
}
