'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * For services/resources with a duplicate_group_id (scripts/054), finds
 * every OTHER sede in the org that has a member of the same group - so the
 * UI can show "tambien en Sede X" on a duplicated offering. Returns a map
 * keyed by duplicate_group_id -> business_ids of the sibling rows,
 * excluding excludeBusinessId (the sede currently being viewed - a
 * within-sede duplicate has nothing useful to say about itself).
 */
export function useDuplicateSiblings(
  table: 'services' | 'resources',
  items: { duplicate_group_id: string | null }[],
  orgBusinessIds: string[],
  excludeBusinessId: string | undefined,
  enabled: boolean
): Record<string, string[]> {
  const [siblings, setSiblings] = useState<Record<string, string[]>>({})

  const groupIdsKey = useMemo(
    () =>
      Array.from(new Set(items.map((i) => i.duplicate_group_id).filter((id): id is string => !!id)))
        .sort()
        .join(','),
    [items]
  )

  useEffect(() => {
    if (!enabled || !groupIdsKey) {
      setSiblings({})
      return
    }
    const groupIds = groupIdsKey.split(',')
    let cancelled = false
    const supabase = createClient()
    supabase
      .from(table)
      .select('business_id, duplicate_group_id')
      .in('duplicate_group_id', groupIds)
      .in('business_id', orgBusinessIds)
      .then(({ data }) => {
        if (cancelled) return
        const map: Record<string, string[]> = {}
        for (const row of (data || []) as { business_id: string; duplicate_group_id: string }[]) {
          if (row.business_id === excludeBusinessId) continue
          if (!map[row.duplicate_group_id]) map[row.duplicate_group_id] = []
          if (!map[row.duplicate_group_id].includes(row.business_id)) {
            map[row.duplicate_group_id].push(row.business_id)
          }
        }
        setSiblings(map)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, groupIdsKey, orgBusinessIds.join(','), excludeBusinessId, enabled])

  return siblings
}
