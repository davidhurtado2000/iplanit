import {
  LayoutDashboard,
  Calendar,
  Briefcase,
  Layers,
  UserCog,
  Users,
  ParkingSquare,
  BarChart3,
  History,
  Settings,
} from 'lucide-react'

// Single source for the dashboard menu, so the desktop sidebar and the
// mobile drawer always list the same items in the same order (they used to
// keep separate lists that drifted apart).
export const NAV_ITEMS = [
  { key: 'dashboard' as const, href: '/dashboard', icon: LayoutDashboard },
  { key: 'calendar' as const, href: '/dashboard/calendar', icon: Calendar },
  { key: 'services' as const, href: '/dashboard/services', icon: Briefcase },
  { key: 'resources' as const, href: '/dashboard/resources', icon: Layers },
  { key: 'workers' as const, href: '/dashboard/workers', icon: UserCog },
  { key: 'clients' as const, href: '/dashboard/clients', icon: Users },
  { key: 'parking' as const, href: '/dashboard/parking', icon: ParkingSquare },
  { key: 'analytics' as const, href: '/dashboard/analytics', icon: BarChart3 },
  { key: 'activity' as const, href: '/dashboard/activity', icon: History },
  { key: 'settings' as const, href: '/dashboard/settings', icon: Settings },
]

export type NavItem = (typeof NAV_ITEMS)[number]

// The phone's bottom bar only fits five - the daily-use ones, in this
// order. Separate from the menu order on purpose.
export const BOTTOM_BAR_KEYS: NavItem['key'][] = ['dashboard', 'calendar', 'clients', 'services', 'analytics']

export function visibleNavItemsFor(business: { role?: string; offers_parking?: boolean } | null | undefined): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (business?.role === 'sales' && (item.key === 'services' || item.key === 'resources' || item.key === 'workers' || item.key === 'analytics')) return false
    if (item.key === 'parking' && !business?.offers_parking) return false
    // Actividad is an accountability trail of what the team did - only the
    // owner sees it, same reasoning as activity_log's RLS (scripts/056).
    if (item.key === 'activity' && business?.role !== 'owner') return false
    return true
  })
}
