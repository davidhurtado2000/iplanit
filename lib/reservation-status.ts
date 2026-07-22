export type ReservationStatusLabels = {
  confirmed: string
  pending: string
  completed: string
  cancelled: string
  noShow: string
}

export function getStatusBadgeVariant(
  status: string
): 'default' | 'secondary' | 'destructive' {
  if (status === 'cancelled' || status === 'no_show') return 'destructive'
  if (status === 'pending') return 'secondary'
  return 'default'
}

export function getStatusLabel(status: string, labels: ReservationStatusLabels): string {
  switch (status) {
    case 'confirmed':
      return labels.confirmed
    case 'pending':
      return labels.pending
    case 'completed':
      return labels.completed
    case 'cancelled':
      return labels.cancelled
    case 'no_show':
      return labels.noShow
    default:
      return status
  }
}
