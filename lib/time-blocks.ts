import { parseInTimezone, toDateStr } from '@/lib/timezone'

// A row of public.time_blocks (scripts/107). Both worker_id and
// resource_id null = the whole business.
export interface TimeBlock {
  id: string
  business_id: string
  worker_id: string | null
  resource_id: string | null
  starts_at: string | null
  ends_at: string | null
  repeat_weekdays: number[] | null
  start_time: string | null
  end_time: string | null
  repeat_from: string | null
  repeat_until: string | null
  reason: string | null
}

export interface TimeBlockOccurrence {
  blockId: string
  workerId: string | null
  resourceId: string | null
  start: Date
  end: Date
  reason: string | null
  recurring: boolean
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Concrete occurrences overlapping [from, to). Weekly blocks are expanded
 * per business-local calendar day - must stay in sync with
 * public.time_block_ranges() in scripts/107, which the public link and the
 * server-side booking checks use.
 */
export function expandTimeBlocks(blocks: TimeBlock[], from: Date, to: Date, tz: string): TimeBlockOccurrence[] {
  const out: TimeBlockOccurrence[] = []
  const firstDay = addDays(toDateStr(from, tz), -1)
  const lastDay = addDays(toDateStr(to, tz), 1)
  for (const b of blocks) {
    if (!b.repeat_weekdays) {
      if (!b.starts_at || !b.ends_at) continue
      const start = new Date(b.starts_at)
      const end = new Date(b.ends_at)
      if (start < to && end > from) {
        out.push({ blockId: b.id, workerId: b.worker_id, resourceId: b.resource_id, start, end, reason: b.reason, recurring: false })
      }
      continue
    }
    if (!b.repeat_from) continue
    const startDay = b.repeat_from > firstDay ? b.repeat_from : firstDay
    const endDay = b.repeat_until && b.repeat_until < lastDay ? b.repeat_until : lastDay
    for (let day = startDay; day <= endDay; day = addDays(day, 1)) {
      const dow = new Date(day + 'T12:00:00Z').getUTCDay()
      if (!b.repeat_weekdays.includes(dow)) continue
      const start = parseInTimezone(`${day}T${(b.start_time ?? '00:00').slice(0, 5)}`, tz)
      const end = b.end_time
        ? parseInTimezone(`${day}T${b.end_time.slice(0, 5)}`, tz)
        : parseInTimezone(`${addDays(day, 1)}T00:00`, tz)
      if (start < to && end > from) {
        out.push({ blockId: b.id, workerId: b.worker_id, resourceId: b.resource_id, start, end, reason: b.reason, recurring: true })
      }
    }
  }
  return out
}

/** Whether an occurrence applies to this worker/resource (business-wide
 * blocks apply to everyone). */
export function blockAppliesTo(o: TimeBlockOccurrence, target: { workerId?: string | null; resourceId?: string | null }) {
  if (!o.workerId && !o.resourceId) return true
  if (o.workerId) return !!target.workerId && o.workerId === target.workerId
  return !!target.resourceId && o.resourceId === target.resourceId
}
