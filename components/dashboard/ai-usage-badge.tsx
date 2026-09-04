'use client'

import { useEffect, useImperativeHandle, useState, forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { AI_USAGE_WARNING_THRESHOLD } from '@/lib/ai-usage'

export interface AiUsageBadgeHandle {
  refresh: () => void
}

// Shown inline in both the summary and chat cards - the add-on's usage cap
// (scripts/077-ai-addon.sql) is combined across both features, so this
// reuses the same GET /api/dashboard/ai-usage endpoint the Settings page
// card already calls. Lets a user see "how much do I have left" right where
// they're spending it, not only after hitting the 429.
export const AiUsageBadge = forwardRef<AiUsageBadgeHandle, { businessId: string }>(function AiUsageBadge(
  { businessId },
  ref
) {
  const { t } = useLanguage()
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null)

  const fetchUsage = async () => {
    try {
      const res = await fetch(`/api/dashboard/ai-usage?businessId=${businessId}`)
      const data = await res.json()
      if (res.ok) setUsage({ used: data.used, limit: data.limit })
    } catch (err) {
      console.error('[iplanit] Error fetching AI usage badge:', err)
    }
  }

  useEffect(() => {
    fetchUsage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId])

  useImperativeHandle(ref, () => ({ refresh: fetchUsage }))

  if (!usage) return null

  const nearLimit = usage.used >= AI_USAGE_WARNING_THRESHOLD

  return (
    <span
      className={cn('text-xs font-medium', nearLimit ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}
      title={t.settings.aiAddonUsageLabel}
    >
      {usage.used}/{usage.limit}
    </span>
  )
})
