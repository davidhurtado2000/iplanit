// Layout helpers for the worker portal's calendar views (/mi-agenda).
// Pure functions - the components only draw what these return.

/** Monday-first month grid: weeks of 7 cells, null = padding outside the month. */
export function monthGrid(monthStart: string): (string | null)[][] {
  const first = new Date(monthStart.slice(0, 8) + '01T12:00:00Z')
  const lead = (first.getUTCDay() + 6) % 7 // blank cells before the 1st (Monday = 0)
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  const cells: (string | null)[] = Array(lead).fill(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${monthStart.slice(0, 8)}${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** Minutes since local midnight of an instant, in the given timezone. */
export function minutesOfDay(iso: string, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

export interface TimelineItem<T> {
  row: T
  /** Minutes from midnight. */
  start: number
  end: number
  /** Side-by-side lane when appointments overlap, and how many lanes the cluster has. */
  lane: number
  lanes: number
}

/** Places a day's appointments on a timeline; overlapping ones share the width. */
export function layoutDay<T extends { start_time: string; end_time: string }>(
  rows: T[],
  tz: string
): TimelineItem<T>[] {
  const items = rows
    .map((row) => {
      const start = minutesOfDay(row.start_time, tz)
      // Never shorter than 20 min so a block stays tappable; a booking that
      // runs past midnight is cut at midnight.
      const rawEnd = minutesOfDay(row.end_time, tz)
      const end = Math.max(rawEnd <= start ? 24 * 60 : rawEnd, start + 20)
      return { row, start, end, lane: 0, lanes: 1 }
    })
    .sort((a, b) => a.start - b.start || a.end - b.end)

  // Group into clusters of mutually-overlapping appointments, then give each
  // appointment the first free lane inside its cluster.
  let cluster: typeof items = []
  let clusterEnd = -1
  const flush = () => {
    const laneEnds: number[] = []
    for (const it of cluster) {
      let lane = laneEnds.findIndex((e) => e <= it.start)
      if (lane === -1) lane = laneEnds.length
      laneEnds[lane] = it.end
      it.lane = lane
    }
    for (const it of cluster) it.lanes = laneEnds.length
  }
  for (const it of items) {
    if (cluster.length > 0 && it.start >= clusterEnd) {
      flush()
      cluster = []
      clusterEnd = -1
    }
    cluster.push(it)
    clusterEnd = Math.max(clusterEnd, it.end)
  }
  if (cluster.length > 0) flush()
  return items
}

/** Hours the day timeline covers: at least 9-20, wider if an appointment falls outside. */
export function timelineHours(items: { start: number; end: number }[]): { startHour: number; endHour: number } {
  let startHour = 9
  let endHour = 20
  for (const it of items) {
    startHour = Math.min(startHour, Math.floor(it.start / 60))
    endHour = Math.max(endHour, Math.ceil(it.end / 60))
  }
  return { startHour, endHour: Math.min(endHour, 24) }
}
