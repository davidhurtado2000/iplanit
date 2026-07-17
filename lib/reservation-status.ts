export type ReservationStatusLabels = {
  confirmed: string
  pending: string
  completed: string
  cancelled: string
}

export function getStatusBadgeVariant(
  status: string
): 'default' | 'secondary' | 'destructive' {
  if (status === 'cancelled') return 'destructive'
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
    default:
      return status
  }
}
