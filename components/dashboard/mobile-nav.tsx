'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { useBusinesses } from '@/hooks/use-businesses'
import { useLanguage } from '@/context/language-context'
import {
  Calendar,
  LayoutDashboard,
  Users,
  Briefcase,
  Settings,
  LogOut,
  Menu,
  X,
  Crown,
  Building2,
  Loader2,
  BarChart3,
  ParkingSquare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { UpgradeModal } from '@/components/upgrade-modal'

interface MobileNavProps {
  isOpen: boolean
  onToggle: () => void
}

// Order matters: the bottom tab bar only shows the first 5 (see
// NAV_ITEMS.slice(0, 5) below), so analytics/parking go last to keep the
// existing 5 quick-access items unchanged - both still reachable from the
// full menu.
const NAV_ITEMS = [
  { key: 'dashboard' as const, href: '/dashboard', icon: LayoutDashboard },
  { key: 'calendar' as const, href: '/dashboard/calendar', icon: Calendar },
  { key: 'services' as const, href: '/dashboard/services', icon: Briefcase },
  { key: 'clients' as const, href: '/dashboard/clients', icon: Users },
  { key: 'settings' as const, href: '/dashboard/settings', icon: Settings },
  { key: 'analytics' as const, href: '/dashboard/analytics', icon: BarChart3 },
  { key: 'parking' as const, href: '/dashboard/parking', icon: ParkingSquare },
]

export function MobileNav({ isOpen, onToggle }: MobileNavProps) {
  const pathname = usePathname()
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const { user, profile, signOut } = useAuth()
  const { currentBusiness, loading: businessLoading } = useBusinesses()
  const { t } = useLanguage()

  const userPlan = profile?.plan || 'free'
  const userName = profile?.full_name || user?.email?.split('@')[0] || t.mobileNav.defaultUser
  const userEmail = profile?.email || user?.email || ''

  // Sales/Cochera filtering - see sidebar.tsx for the same filter and the
  // reasoning behind it.
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (currentBusiness?.role === 'sales' && (item.key === 'services' || item.key === 'analytics')) return false
    if (item.key === 'parking' && !currentBusiness?.offers_parking) return false
    return true
  })

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <>
      {/* Fixed Top Bar */}
      <div className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b bg-background px-4 lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Calendar className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold">iPlanit</span>
        </Link>

        <Sheet open={isOpen} onOpenChange={onToggle}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">{t.mobileNav.openMenu}</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[280px] p-0">
            <SheetTitle className="sr-only">{t.mobileNav.menuTitle}</SheetTitle>
            <div className="flex h-full flex-col">
              {/* Header */}
              <div className="flex h-14 items-center justify-between border-b px-4">
                <span className="text-lg font-bold">{t.mobileNav.menu}</span>
                <Button variant="ghost" size="icon" onClick={onToggle}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* User info */}
              <div className="border-b p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={profile?.avatar_url || undefined} alt={userName} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {getInitials(userName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 overflow-hidden">
                    <p className="truncate text-sm font-medium">{userName}</p>
                    <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
                  </div>
                </div>
              </div>

              {/* Business info */}
              <div className="border-b p-4">
                {businessLoading ? (
                  <div className="flex items-center justify-center py-2">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : currentBusiness ? (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="truncate text-sm font-medium">{currentBusiness.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{currentBusiness.timezone}</p>
                    </div>
                  </div>
                ) : (
                  <Link
                    href="/dashboard/settings"
                    onClick={onToggle}
                    className="flex items-center gap-3"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30">
                      <Building2 className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="truncate text-sm font-medium">{t.mobileNav.setupBusiness}</p>
                      <p className="truncate text-xs text-amber-500">{t.mobileNav.setupBusinessCta}</p>
                    </div>
                  </Link>
                )}
              </div>

              {/* Navigation */}
              <nav className="flex-1 space-y-1 p-2">
                {visibleNavItems.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={onToggle}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground/70 hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      <span>{t.nav[item.key]}</span>
                    </Link>
                  )
                })}
              </nav>

              {/* Plan Badge / Upgrade CTA */}
              <div className="border-t p-4">
                {userPlan === 'premium' ? (
                  <div className="rounded-lg bg-gradient-to-r from-amber-500/10 to-orange-500/10 p-3">
                    <div className="flex items-center gap-2">
                      <Crown className="h-4 w-4 text-amber-500" />
                      <span className="text-sm font-medium">{t.mobileNav.premium}</span>
                    </div>
                  </div>
                ) : (
                  <Button
                    className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600"
                    onClick={() => {
                      onToggle()
                      setShowUpgradeModal(true)
                    }}
                  >
                    <Crown className="h-4 w-4" />
                    {t.mobileNav.premium}
                  </Button>
                )}
              </div>

              {/* Logout */}
              <div className="border-t p-2">
                <button
                  onClick={() => {
                    onToggle()
                    signOut()
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  <LogOut className="h-5 w-5" />
                  <span>{t.mobileNav.signOut}</span>
                </button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Bottom Navigation Bar for quick access on mobile */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background lg:hidden">
        <nav className="flex items-center justify-around py-2">
          {visibleNavItems.slice(0, 5).map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-1 p-2 text-xs transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <item.icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                <span className="truncate max-w-[60px]">{t.nav[item.key].slice(0, 6)}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Spacer for bottom nav */}
      <div className="h-16 lg:hidden" />

      <UpgradeModal isOpen={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />
    </>
  )
}
