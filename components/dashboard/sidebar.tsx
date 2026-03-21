'use client'

import { useState } from 'react'
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
  Crown,
  Building2,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { UpgradeModal } from '@/components/upgrade-modal'

interface SidebarProps {
  isCollapsed: boolean
  onToggle: () => void
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Calendario', href: '/dashboard/calendar', icon: Calendar },
  { name: 'Servicios', href: '/dashboard/services', icon: Briefcase },
  { name: 'Clientes', href: '/dashboard/clients', icon: Users },
  { name: 'Configuracion', href: '/dashboard/settings', icon: Settings },
]

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const { user, profile, loading: authLoading, signOut } = useAuth()
  const { businesses, loading: businessLoading } = useBusinesses()

  const currentBusiness = businesses?.[0]
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
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
              <Calendar className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            {!isCollapsed && (
              <span className="text-lg font-bold text-sidebar-foreground">iPlannit</span>
            )}
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={onToggle}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Business Info */}
        {!isCollapsed && (
          <div className="border-b border-sidebar-border p-4">
            {businessLoading ? (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="h-5 w-5 animate-spin text-sidebar-foreground/50" />
              </div>
            ) : currentBusiness ? (
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

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-2">
          {navigation.map((item) => {
            const isActive = pathname === item.href
            const NavLink = (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!isCollapsed && <span>{item.name}</span>}
              </Link>
            )

            if (isCollapsed) {
              return (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>{NavLink}</TooltipTrigger>
                  <TooltipContent side="right" className="font-medium">
                    {item.name}
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
                <TooltipContent>Cerrar sesion</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </aside>
      <UpgradeModal isOpen={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />
    </TooltipProvider>
  )
}
