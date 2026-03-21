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
  Menu,
  X,
  Crown,
  Building2,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { UpgradeModal } from '@/components/upgrade-modal'

interface MobileNavProps {
  isOpen: boolean
  onToggle: () => void
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Calendario', href: '/dashboard/calendar', icon: Calendar },
  { name: 'Servicios', href: '/dashboard/services', icon: Briefcase },
  { name: 'Clientes', href: '/dashboard/clients', icon: Users },
  { name: 'Configuracion', href: '/dashboard/settings', icon: Settings },
]

export function MobileNav({ isOpen, onToggle }: MobileNavProps) {
  const pathname = usePathname()
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const { user, profile, signOut } = useAuth()
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
    <>
      {/* Fixed Top Bar */}
      <div className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b bg-background px-4 lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Calendar className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold">iPlannit</span>
        </Link>

        <Sheet open={isOpen} onOpenChange={onToggle}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Abrir menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[280px] p-0">
            <SheetTitle className="sr-only">Menu de navegacion</SheetTitle>
            <div className="flex h-full flex-col">
              {/* Header */}
              <div className="flex h-14 items-center justify-between border-b px-4">
                <span className="text-lg font-bold">Menu</span>
                <Button variant="ghost" size="icon" onClick={onToggle}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* User info */}
              <div className="border-b p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
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
                      <p className="truncate text-sm font-medium">Configurar negocio</p>
                      <p className="truncate text-xs text-amber-500">Toca para comenzar</p>
                    </div>
                  </Link>
                )}
              </div>

              {/* Navigation */}
              <nav className="flex-1 space-y-1 p-2">
                {navigation.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.name}
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
                      <span>{item.name}</span>
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
                      <span className="text-sm font-medium">Plan Premium</span>
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
                    Plan Premium
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
                  <span>Cerrar sesion</span>
                </button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Bottom Navigation Bar for quick access on mobile */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background lg:hidden">
        <nav className="flex items-center justify-around py-2">
          {navigation.slice(0, 5).map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-1 p-2 text-xs transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <item.icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                <span className="truncate max-w-[60px]">{item.name.slice(0, 6)}</span>
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
