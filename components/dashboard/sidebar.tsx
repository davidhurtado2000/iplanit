'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { useBusinesses } from '@/hooks/use-businesses'
import {
  Calendar,
  LayoutDashboard,
  Users,
  Briefcase,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Check,
  Crown,
  Building2,
  Loader2,
  Clock,
  BarChart3,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UpgradeModal } from '@/components/upgrade-modal'
import { useLanguage } from '@/context/language-context'

interface SidebarProps {
  isCollapsed: boolean
  onToggle: () => void
}

const NAV_ITEMS = [
  { key: 'dashboard' as const, href: '/dashboard', icon: LayoutDashboard },
  { key: 'calendar' as const, href: '/dashboard/calendar', icon: Calendar },
  { key: 'services' as const, href: '/dashboard/services', icon: Briefcase },
  { key: 'clients' as const, href: '/dashboard/clients', icon: Users },
  { key: 'analytics' as const, href: '/dashboard/analytics', icon: BarChart3 },
  { key: 'settings' as const, href: '/dashboard/settings', icon: Settings },
]

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [now, setNow] = useState<Date | null>(null)
  const { user, profile, loading: authLoading, signOut } = useAuth()
  const { businesses, currentBusiness, switchBusiness, loading: businessLoading } = useBusinesses()
  const { t } = useLanguage()

  useEffect(() => {
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const tz = currentBusiness?.timezone || 'America/Lima'
  const localDate = now
    ? now.toLocaleDateString('es-ES', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' })
    : null
  const localTime = now
    ? now.toLocaleTimeString('es-ES', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true })
    : null

  const userPlan = profile?.plan || 'free'
  const userName = profile?.full_name || user?.email?.split('@')[0] || 'Usuario'
  const userEmail = profile?.email || user?.email || ''

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar transition-all duration-300',
          isCollapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Collapse toggle — floats on the sidebar's edge instead of sharing
            the header row, so it never has to squeeze next to the logo in
            the 64px collapsed width. */}
        <button
          type="button"
          onClick={onToggle}
          aria-label={isCollapsed ? t.expandSidebar : t.collapseSidebar}
          className="absolute -right-3 top-5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {isCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" />
          )}
        </button>

        {/* Header */}
        <div className="flex h-16 items-center border-b border-sidebar-border px-4">
          <Link href="/dashboard" className="flex items-center gap-2 overflow-hidden">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
              <Calendar className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            {!isCollapsed && (
              <span className="text-lg font-bold text-sidebar-foreground">iPlanit</span>
            )}
          </Link>
        </div>

        {/* Business Info */}
        {!isCollapsed && (
          <div className="border-b border-sidebar-border p-4">
            {businessLoading ? (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="h-5 w-5 animate-spin text-sidebar-foreground/50" />
              </div>
            ) : currentBusiness ? (
              businesses.length > 1 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="-m-1 flex w-[calc(100%+0.5rem)] items-center gap-3 rounded-lg p-1 text-left transition-colors hover:bg-sidebar-accent/50"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent">
                        <Building2 className="h-5 w-5 text-sidebar-accent-foreground" />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="truncate text-sm font-medium text-sidebar-foreground">
                          {currentBusiness.name}
                        </p>
                        <p className="truncate text-xs text-sidebar-foreground/60">
                          {currentBusiness.role === 'owner' ? t.sidebar.roleOwner : t.sidebar.roleStaff}
                        </p>
                      </div>
                      <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-foreground/50" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-60">
                    {businesses.map((b) => (
                      <DropdownMenuItem key={b.id} onClick={() => switchBusiness(b.id)} className="gap-2">
                        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="flex-1 overflow-hidden">
                          <p className="truncate text-sm">{b.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {b.role === 'owner' ? t.sidebar.roleOwner : t.sidebar.roleStaff}
                          </p>
                        </div>
                        {b.id === currentBusiness.id && (
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-accent">
                    <Building2 className="h-5 w-5 text-sidebar-accent-foreground" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="truncate text-sm font-medium text-sidebar-foreground">
                      {currentBusiness.name}
                    </p>
                    <p className="truncate text-xs text-sidebar-foreground/60">
                      {currentBusiness.timezone}
                    </p>
                  </div>
                </div>
              )
            ) : (
              <Link 
                href="/dashboard/settings" 
                className="flex items-center gap-3 rounded-lg p-2 hover:bg-sidebar-accent/50 transition-colors"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-dashed border-sidebar-foreground/30">
                  <Building2 className="h-5 w-5 text-sidebar-foreground/50" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="truncate text-sm font-medium text-sidebar-foreground">
                    Configurar negocio
                  </p>
                  <p className="truncate text-xs text-amber-500">
                    Haz clic para comenzar
                  </p>
                </div>
              </Link>
            )}
          </div>
        )}

        {/* Date & Time — only rendered client-side to avoid hydration mismatch */}
        {now && (!isCollapsed ? (
          <div className="border-b border-sidebar-border px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs text-sidebar-foreground/60 capitalize">{localDate}</span>
            <span className="flex items-center gap-1 text-sm font-semibold text-sidebar-foreground tabular-nums">
              <Clock className="h-3.5 w-3.5 text-sidebar-foreground/50" />
              {localTime}
            </span>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex justify-center border-b border-sidebar-border py-2.5">
                <Clock className="h-4 w-4 text-sidebar-foreground/50" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">{localDate} · {localTime}</TooltipContent>
          </Tooltip>
        ))}

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-2">
          {NAV_ITEMS.map((item) => {
            const label = t.nav[item.key]
            const isActive = pathname === item.href
            const NavLink = (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!isCollapsed && <span>{label}</span>}
              </Link>
            )

            if (isCollapsed) {
              return (
                <Tooltip key={item.key}>
                  <TooltipTrigger asChild>{NavLink}</TooltipTrigger>
                  <TooltipContent side="right" className="font-medium">
                    {label}
                  </TooltipContent>
                </Tooltip>
              )
            }

            return NavLink
          })}
        </nav>

        {/* Plan Badge */}
        {!isCollapsed && userPlan === 'premium' && (
          <div className="mx-2 mb-2 rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/20 p-3">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-medium text-sidebar-foreground">Plan Premium</span>
            </div>
          </div>
        )}

        {!isCollapsed && userPlan === 'free' && (
          <div className="mx-2 mb-2">
            <Button
              className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600"
              onClick={() => setShowUpgradeModal(true)}
            >
              <Crown className="h-4 w-4" />
              Plan Premium
            </Button>
          </div>
        )}

        {/* User Section */}
        <div className="border-t border-sidebar-border p-2">
          <div
            className={cn(
              'flex items-center gap-3 rounded-lg p-2',
              isCollapsed ? 'justify-center' : ''
            )}
          >
            <Avatar className="h-9 w-9">
              <AvatarImage src={profile?.avatar_url || undefined} alt={userName} />
              <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground">
                {getInitials(userName)}
              </AvatarFallback>
            </Avatar>
            {!isCollapsed && (
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium text-sidebar-foreground">
                  {userName}
                </p>
                <p className="truncate text-xs text-sidebar-foreground/60">{userEmail}</p>
              </div>
            )}
            {!isCollapsed && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    onClick={signOut}
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t.signOut}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </aside>
      <UpgradeModal isOpen={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />
    </TooltipProvider>
  )
}
