// "Sin preferencia" as a real pool (scripts/118, no_preference_mode = 'pool').
//
// A booking with no preference is stored WITHOUT a barber (worker_id null,
// no_preference_pool = true) until reception picks one, so it must not take
// any particular barber's time - a loyal client of Paul can still book Paul
// at that hour. But it does take one unit of the team's capacity, so the
// shop is never overbooked.
//
// The rule, per start time t (F = barbers free for the whole appointment at
// t, P = pool bookings overlapping that appointment):
//   - "Sin preferencia" is offered when F > P
//   - a specific barber is offered when THEY are free AND F > P
//     (once they take it, F-1 >= P barbers still cover the pool bookings)
//
// Simplification (same as the SQL, scripts/118 pool_booking_count): the
// pool bookings that overlap the appointment are counted as all competing
// for the barbers free for it. Exact for the common case (everyone works the
// same shift and appointments of similar length); in odd edge cases it can
// be slightly strict or lenient, never by more than a booking or two.

export interface TimeRange {
  start_time: string
  end_time: string
}

export interface PoolCapacityInput {
  /** For each eligible barber, the start times they could take (already
   * filtered by their schedule, time blocks, assigned bookings and buffers). */
  perWorkerSlots: Date[][]
  /** Active pool bookings (no barber yet) in the period. */
  poolRanges: TimeRange[]
  /** Duration of the service being booked, plus its buffers (minutes). */
  durationMinutes: number
  bufferBeforeMinutes?: number
  bufferAfterMinutes?: number
}

export interface PoolCapacityResult {
  /** Start times offered for "Sin preferencia". */
  anySlots: Date[]
  /** For each barber (same order as the input), the start times offered
   * when the client picks that barber. */
  workerSlots: Date[][]
}

const MIN = 60_000

export function applyPoolCapacity(input: PoolCapacityInput): PoolCapacityResult {
  const { perWorkerSlots, poolRanges, durationMinutes } = input
  const before = (input.bufferBeforeMinutes ?? 0) * MIN
  const after = (input.bufferAfterMinutes ?? 0) * MIN
  const pool = poolRanges.map((r) => ({ s: new Date(r.start_time).getTime(), e: new Date(r.end_time).getTime() }))

  // F per start time.
  const freeAt = new Map<number, number>()
  for (const slots of perWorkerSlots) {
    for (const slot of slots) freeAt.set(slot.getTime(), (freeAt.get(slot.getTime()) ?? 0) + 1)
  }

  const poolAt = (t: number) => {
    const from = t - before
    const to = t + durationMinutes * MIN + after
    let n = 0
    for (const p of pool) if (p.s < to && p.e > from) n += 1
    return n
  }

  const allowed = new Set<number>()
  for (const [t, free] of freeAt) if (free > poolAt(t)) allowed.add(t)

  return {
    anySlots: [...allowed].sort((a, b) => a - b).map((t) => new Date(t)),
    workerSlots: perWorkerSlots.map((slots) => slots.filter((s) => allowed.has(s.getTime()))),
  }
}
