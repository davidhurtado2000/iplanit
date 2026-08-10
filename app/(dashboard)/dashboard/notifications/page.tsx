'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CalendarPlus, XCircle, Clock, Check, Loader2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBusinesses } from '@/hooks/use-businesses'
import { useLanguage } from '@/context/language-context'
import { useDashboardData } from '@/context/dashboard-data-context'
import { useNotifications } from '@/context/notifications-context'
import { createClient } from '@/lib/supabase/client'
import { toDateStr } from '@/lib/timezone'
import { cn } from '@/lib/utils'

type HistoryType = 'new_reservation' | 'client_cancelled'
type HistoryFilter = 'all' | HistoryType

interface ReservationSummary {
  id: string
  client_id: string
  service_id: string | null
  start_time: string
  type: 'booking' | 'visit'
}

interface HistoryItem {
  id: string
  type: HistoryType
  created_at: string
  reservation: ReservationSummary | null
}

const PAGE_SIZE = 20

const TYPE_ICON: Record<HistoryType, typeof Bell> = {
  new_reservation: CalendarPlus,
  client_cancelled: XCircle,
}

export default function NotificationsPage() {
  const { t, locale } = useLanguage()
  const router = useRouter()
  const { currentBusiness } = useBusinesses()
  const { clients, services } = useDashboardData()
  const { notifications: liveNotifications } = useNotifications()
  const supabase = createClient()

  const clientsMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients])
  const servicesMap = useMemo(() => Object.fromEntries(services.map((s) => [s.id, s])), [services])

  const [filter, setFilter] = useState<HistoryFilter>('all')
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(0)
  const [loadError, setLoadError] = useState(false)

  // Two-step fetch (notifications, then the reservations they reference)
  // instead of a single embedded select - simpler and robust regardless of
  // whether the referenced reservation has since been deleted (left join
  // behavior would need extra handling either way; here it's just a
  // missing map entry, handled explicitly below).
  const loadPage = async (targetPage: number) => {
    if (!currentBusiness) return
    targetPage === 0 ? setLoading(true) : setLoadingMore(true)
    setLoadError(false)
    try {
      let query = supabase
        .from('notifications')
        .select('id, type, created_at, reservation_id')
        .eq('business_id', currentBusiness.id)
        .order('created_at', { ascending: false })
        .range(targetPage * PAGE_SIZE, targetPage * PAGE_SIZE + PAGE_SIZE - 1)
      if (filter !== 'all') query = query.eq('type', filter)

      const { data: notifRows, error } = await query
      if (error) {
        // Most likely cause: scripts/055-notifications-history.sql hasn't
        // been run yet, so this table doesn't exist - surface that instead
        // of silently rendering the same empty state as "genuinely no
        // notifications yet", which is impossible to tell apart otherwise.
        console.error('[iplanit] Error loading notification history:', error)
        setLoadError(true)
        if (targetPage === 0) setItems([])
        setHasMore(false)
        return
      }
      const rows = notifRows || []

      const reservationIds = [...new Set(rows.map((r) => r.reservation_id))]
      const { data: reservationRows } = reservationIds.length
        ? await supabase
            .from('reservations')
            .select('id, client_id, service_id, start_time, type')
            .in('id', reservationIds)
        : { data: [] as ReservationSummary[] }
      const reservationsById = Object.fromEntries((reservationRows || []).map((r) => [r.id, r as ReservationSummary]))

      const pageItems: HistoryItem[] = rows.map((r) => ({
        id: r.id,
        type: r.type as HistoryType,
        created_at: r.created_at,
        reservation: reservationsById[r.reservation_id] || null,
      }))

      setItems((prev) => (targetPage === 0 ? pageItems : [...prev, ...pageItems]))
      setHasMore(rows.length === PAGE_SIZE)
      setPage(targetPage)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    setItems([])
    setHasMore(true)
    loadPage(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusiness?.id, filter])

  const goToReservationDay = (startTime: string) => {
    const dateStr = toDateStr(startTime, currentBusiness?.timezone || 'America/Lima')
    router.push(`/dashboard/calendar?date=${dateStr}`)
  }

  const describe = (reservation: ReservationSummary | null) => {
    if (!reservation) return t.notifications.deletedReservation
    const client = clientsMap[reservation.client_id]
    const service = reservation.service_id ? servicesMap[reservation.service_id] : undefined
    const who = client?.name || t.reservation.clientSelect
    return service ? `${who} — ${service.name}` : who
  }

  const filters: { value: HistoryFilter; label: string }[] = [
    { value: 'all', label: t.notifications.filterAll },
    { value: 'new_reservation', label: t.notifications.newReservation },
    { value: 'client_cancelled', label: t.notifications.clientCancelled },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t.notifications.title}</h1>
        <p className="text-muted-foreground">{t.notifications.pageSubtitle}</p>
      </div>

      {(['starting_soon', 'confirmed'] as const).map((liveType) => {
        const liveItems = liveNotifications.filter((n) => n.type === liveType)
        if (liveItems.length === 0) return null
        const Icon = liveType === 'starting_soon' ? Clock : Check
        return (
          <div key={liveType} className="space-y-2">
            <p className="text-sm font-semibold text-foreground">
              {liveType === 'starting_soon' ? t.notifications.startingSoon : t.notifications.confirmed}
            </p>
            <div className="divide-y rounded-lg border">
              {liveItems.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => goToReservationDay(n.reservation.start_time)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{describe(n.reservation)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(n.reservation.start_time).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )
      })}

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="notif-filter" className="text-sm text-muted-foreground">
            {t.notifications.filterLabel}
          </Label>
          <Select value={filter} onValueChange={(v) => setFilter(v as HistoryFilter)}>
            <SelectTrigger id="notif-filter" className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {filters.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-destructive/40 py-16 text-center">
            <Bell className="h-8 w-8 text-destructive/60" />
            <p className="text-sm text-destructive">{t.notifications.loadError}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
            <Bell className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{t.notifications.empty}</p>
          </div>
        ) : (
          <>
            <div className="divide-y rounded-lg border">
              {items.map((item) => {
                const Icon = TYPE_ICON[item.type]
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => item.reservation && goToReservationDay(item.reservation.start_time)}
                    disabled={!item.reservation}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <Icon
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        item.type === 'client_cancelled' ? 'text-destructive' : 'text-primary'
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        {item.type === 'new_reservation' ? t.notifications.newReservation : t.notifications.clientCancelled}
                      </p>
                      <p className="truncate text-sm text-foreground">{describe(item.reservation)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>

            {hasMore && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => loadPage(page + 1)}
                  disabled={loadingMore}
                  className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t.notifications.loadMore}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
