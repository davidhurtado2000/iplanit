import { Badge } from '@/components/ui/badge'
import { Clock, Check, CheckCheck, X, Minus } from 'lucide-react'
import { getStatusBadgeVariant, getStatusLabel, type ReservationStatusLabels } from '@/lib/reservation-status'
import { cn } from '@/lib/utils'

// Color alone (the Badge variant) isn't always enough to tell "confirmed"
// from "completed" apart at a glance, or for anyone relying on shape more
// than hue - matches the icons already promised in the calendar's own
// Leyenda popover (calendar-view.tsx).
const STATUS_ICON: Record<string, typeof Clock> = {
  pending: Clock,
  confirmed: Check,
  completed: CheckCheck,
  cancelled: X,
  no_show: Minus,
}

interface StatusBadgeProps {
  status: string
  labels: ReservationStatusLabels
  className?: string
}

export function StatusBadge({ status, labels, className }: StatusBadgeProps) {
  const Icon = STATUS_ICON[status]
  return (
    <Badge variant={getStatusBadgeVariant(status)} className={cn('gap-1', className)}>
      {Icon && <Icon className="h-3 w-3 shrink-0" />}
      {getStatusLabel(status, labels)}
    </Badge>
  )
}
