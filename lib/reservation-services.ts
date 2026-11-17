// Several services in ONE appointment (scripts/119). The reservation keeps
// its main service in reservations.service_id; the EXTRA services live in
// reservation_services. reservations.price is the TOTAL and end_time already
// covers the summed duration, so everything that only needs "when" and "how
// much" keeps working untouched. These helpers cover the rest: the label
// ("Corte + Barba"), the per-service split for reports, and the extras'
// amounts.

export interface ReservationExtra {
  id: string
  business_id: string
  reservation_id: string
  service_id: string
  price: number | null
  price_usd: number | null
  duration_minutes: number
  position: number
}

/** reservation_id -> its extra services, in the order they were added. */
export function groupExtras<T extends Pick<ReservationExtra, 'reservation_id' | 'position'>>(
  extras: T[]
): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const e of extras) {
    const list = out.get(e.reservation_id)
    if (list) list.push(e)
    else out.set(e.reservation_id, [e])
  }
  for (const list of out.values()) list.sort((a, b) => a.position - b.position)
  return out
}

/** A business bills in one currency, so whichever price is filled is the one. */
export function extraAmount(e: Pick<ReservationExtra, 'price' | 'price_usd'>): number {
  return Number(e.price || e.price_usd || 0)
}

export function extrasTotal(extras: Pick<ReservationExtra, 'price' | 'price_usd'>[]): number {
  return extras.reduce((sum, e) => sum + extraAmount(e), 0)
}

/** "Corte de cabello + Barba": the main service plus its extras' names. */
export function serviceLabel(
  primaryName: string | null | undefined,
  extras: Pick<ReservationExtra, 'service_id'>[],
  services: { id: string; name: string }[]
): string {
  const names = [primaryName, ...extras.map((e) => services.find((s) => s.id === e.service_id)?.name)].filter(
    (n): n is string => !!n
  )
  return names.join(' + ')
}
