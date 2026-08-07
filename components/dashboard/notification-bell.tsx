'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CalendarPlus, XCircle, Clock } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLanguage } from '@/context/language-context'
import { useDashboardData } from '@/context/dashboard-data-context'
import { useNotifications, type NotificationItem, type NotificationType } from '@/context/notifications-context'
import { cn } from '@/lib/utils'

const TYPE_ICON: Record<NotificationType, typeof Bell> = {
  new_reservation: CalendarPlus,
  client_cancelled: XCircle,
  starting_soon: Clock,
}

type BellFilter = 'all' | NotificationType

export function NotificationBell({ className }: { className?: string }) {
  const { t, locale } = useLanguage()
  const router = useRouter()
  const { clients, services } = useDashboardData()
  const { notifications, unreadCount, markAllSeen } = useNotifications()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<BellFilter>('all')

  const clientsMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients])
  const servicesMap = useMemo(() => Object.fromEntries(services.map((s) => [s.id, s])), [services])

  const typeLabel: Record<NotificationType, string> = {
    new_reservation: t.notifications.newReservation,
    client_cancelled: t.notifications.clientCancelled,
    starting_soon: t.notifications.startingSoon,
  }

  const filteredNotifications = filter === 'all' ? notifications : notifications.filter((n) => n.type === filter)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      markAllSeen()
      setFilter('all')
    }
  }

  const goToCalendar = () => {
    setOpen(false)
    markAllSeen()
    router.push('/dashboard/calendar')
  }

  const goToHistory = () => {
    setOpen(false)
    markAllSeen()
    router.push('/dashboard/notifications')
  }

  const describe = (item: NotificationItem) => {
    const client = clientsMap[item.reservation.client_id]
    const service = item.reservation.service_id ? servicesMap[item.reservation.service_id] : undefined
    const who = client?.name || t.reservation.clientSelect
    return service ? `${who} — ${service.name}` : who
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn('relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent/50', className)}
        >
          <Bell className="h-4.5 w-4.5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
          <span className="sr-only">{t.notifications.title}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <p className="text-sm font-semibold text-foreground">{t.notifications.title}</p>
          <Select value={filter} onValueChange={(v) => setFilter(v as BellFilter)}>
            <SelectTrigger size="sm" className="h-7 w-auto gap-1 border-none bg-muted px-2 text-xs shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">{t.notifications.filterAll}</SelectItem>
              <SelectItem value="new_reservation">{typeLabel.new_reservation}</SelectItem>
              <SelectItem value="client_cancelled">{typeLabel.client_cancelled}</SelectItem>
              <SelectItem value="starting_soon">{typeLabel.starting_soon}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {filteredNotifications.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t.notifications.empty}</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {filteredNotifications.map((item) => {
              const Icon = TYPE_ICON[item.type]
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={goToCalendar}
                  className="flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/50"
                >
                  <Icon
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0',
                      item.type === 'client_cancelled' ? 'text-destructive' : 'text-primary'
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground">{typeLabel[item.type]}</p>
                    <p className="truncate text-sm text-foreground">{describe(item)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.reservation.start_time).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
        <button
          type="button"
          onClick={goToHistory}
          className="w-full border-t px-4 py-2.5 text-center text-xs font-medium text-primary transition-colors hover:bg-muted/50"
        >
          {t.notifications.viewFullHistory}
        </button>
      </PopoverContent>
    </Popover>
  )
}
