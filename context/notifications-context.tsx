'use client'

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { useBusinessContext } from './business-context'
import { useDashboardData, type Reservation } from './dashboard-data-context'

export type NotificationType = 'new_reservation' | 'client_cancelled' | 'starting_soon' | 'confirmed'

export interface NotificationItem {
  id: string
  type: NotificationType
  reservation: Reservation
  timestamp: string
}

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000
const STARTING_SOON_MS = 60 * 60 * 1000
const MAX_ITEMS = 20

interface NotificationsContextValue {
  notifications: NotificationItem[]
  unreadCount: number
  markAllSeen: () => void
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined)

function seenStorageKey(businessId: string) {
  return `iplanit_notif_seen_${businessId}`
}

function readSeenIds(businessId: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(seenStorageKey(businessId))
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { currentBusiness } = useBusinessContext()
  const { reservations } = useDashboardData()

  // Purely time-driven windows (starting_soon, and the 24h recency cutoff)
  // need to re-evaluate as the clock moves even when no data changes -
  // reservations updating live (existing realtime subscription in
  // dashboard-data-context.tsx) already covers the data-driven side.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])

  const [seenIds, setSeenIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!currentBusiness) return
    setSeenIds(readSeenIds(currentBusiness.id))
  }, [currentBusiness?.id])

  const notifications = useMemo<NotificationItem[]>(() => {
    if (!currentBusiness) return []
    const items: NotificationItem[] = []

    for (const r of reservations) {
      const createdAt = new Date(r.created_at).getTime()
      if (now - createdAt <= RECENT_WINDOW_MS) {
        items.push({ id: `new_reservation:${r.id}`, type: 'new_reservation', reservation: r, timestamp: r.created_at })
      }

      if (r.status === 'cancelled' && r.cancelled_by === 'client' && r.cancelled_at) {
        const cancelledAt = new Date(r.cancelled_at).getTime()
        if (now - cancelledAt <= RECENT_WINDOW_MS) {
          items.push({ id: `client_cancelled:${r.id}`, type: 'client_cancelled', reservation: r, timestamp: r.cancelled_at })
        }
      }

      if (r.status === 'pending' || r.status === 'confirmed') {
        const startsAt = new Date(r.start_time).getTime()
        if (startsAt > now && startsAt - now <= STARTING_SOON_MS) {
          items.push({ id: `starting_soon:${r.id}`, type: 'starting_soon', reservation: r, timestamp: r.start_time })
        }
      }

      // No confirmed_at column exists, so updated_at is used as a "recently
      // confirmed" proxy (see the Reservation.updated_at comment). Guarded
      // against updated_at ~= created_at so a reservation created directly
      // as confirmed doesn't also fire this - only a REAL pending ->
      // confirmed transition sometime after creation counts.
      if (r.status === 'confirmed') {
        const updatedAt = new Date(r.updated_at).getTime()
        const createdAt = new Date(r.created_at).getTime()
        if (updatedAt - createdAt > 2000 && now - updatedAt <= RECENT_WINDOW_MS) {
          items.push({ id: `confirmed:${r.id}`, type: 'confirmed', reservation: r, timestamp: r.updated_at })
        }
      }
    }

    return items.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, MAX_ITEMS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservations, currentBusiness?.id, now])

  // Prunes localStorage to only ids still present in the feed - items that
  // aged out of the time windows are dropped for free, no separate cleanup.
  useEffect(() => {
    if (!currentBusiness) return
    setSeenIds((prev) => {
      const validIds = new Set(notifications.map((n) => n.id))
      const pruned = new Set([...prev].filter((id) => validIds.has(id)))
      if (pruned.size === prev.size) return prev
      window.localStorage.setItem(seenStorageKey(currentBusiness.id), JSON.stringify([...pruned]))
      return pruned
    })
  }, [notifications, currentBusiness?.id])

  const unreadCount = useMemo(
    () => notifications.filter((n) => !seenIds.has(n.id)).length,
    [notifications, seenIds]
  )

  const markAllSeen = useCallback(() => {
    if (!currentBusiness) return
    const allIds = new Set(notifications.map((n) => n.id))
    setSeenIds(allIds)
    window.localStorage.setItem(seenStorageKey(currentBusiness.id), JSON.stringify([...allIds]))
  }, [notifications, currentBusiness])

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, markAllSeen }}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotifications must be used within a NotificationsProvider')
  return ctx
}
