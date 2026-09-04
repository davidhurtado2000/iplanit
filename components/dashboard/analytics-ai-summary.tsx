'use client'

import { useRef, useState } from 'react'
import { Sparkles, Loader2, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/language-context'
import { AiAddonRequired } from '@/components/dashboard/ai-addon-required'
import { AiUsageBadge, type AiUsageBadgeHandle } from '@/components/dashboard/ai-usage-badge'
import { formatResetDate } from '@/lib/ai-usage-client'

export interface AnalyticsSummaryMetrics {
  currencySymbol: string
  totalRevenue: number
  totalReservations: number
  occupancyRate: number
  bookedHours: number
  openHours: number
  retentionRate: number
  newClients: number
  returningClients: number
  topServiceName: string | null
  topServiceCount: number | null
  averageTicket: number
  noShowRate: number
  cancellationRate: number
}

// Click-to-generate, not automatic - the metrics below change on every date-
// range filter change, and re-running this on every render/filter tweak
// would burn real OpenAI cost for no reason (see docs/roadmap-ia-whatsapp.md
// - each call costs a fraction of a cent, but there's no reason to spend it
// on a summary nobody asked to see).
export function AnalyticsAiSummary({
  businessId,
  metrics,
  aiAddonActive,
}: {
  businessId: string
  metrics: AnalyticsSummaryMetrics
  aiAddonActive: boolean
}) {
  const { t, language } = useLanguage()
  const tr = t.analytics
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const usageBadgeRef = useRef<AiUsageBadgeHandle>(null)

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/analytics-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, language, metrics }),
      })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        if (res.status === 429) {
          const dateLabel = formatResetDate(data?.resetsOn, language)
          setError(dateLabel ? `${tr.aiSummaryRateLimited} ${dateLabel}.` : tr.aiSummaryRateLimited)
        } else {
          setError(tr.aiSummaryError)
        }
        return
      }

      setSummary(data?.summary ?? null)
      usageBadgeRef.current?.refresh()
    } catch (err) {
      console.error('[iplanit] Error requesting AI summary:', err)
      setError(tr.aiSummaryError)
    } finally {
      setLoading(false)
    }
  }

  if (!aiAddonActive) {
    return <AiAddonRequired />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {tr.aiSummaryTitle}
        </CardTitle>
        <CardDescription>{tr.aiSummaryDesc}</CardDescription>
        <CardAction>
          <AiUsageBadge ref={usageBadgeRef} businessId={businessId} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {summary ? (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-foreground">{summary}</p>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleGenerate} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {tr.aiSummaryRegenerateBtn}
            </Button>
          </div>
        ) : (
          <Button size="sm" className="gap-2" onClick={handleGenerate} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {loading ? tr.aiSummaryLoading : tr.aiSummaryGenerateBtn}
          </Button>
        )}
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
