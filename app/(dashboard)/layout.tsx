'use client'

import React, { useState } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { MobileNav } from '@/components/dashboard/mobile-nav'
import { BusinessProvider } from '@/context/business-context'
import { cn } from '@/lib/utils'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  return (
    <BusinessProvider>
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
    </div>
    </BusinessProvider>
  )
}
