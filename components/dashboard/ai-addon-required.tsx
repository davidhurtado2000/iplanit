'use client'

import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/language-context'

// Shown instead of the summary/chat UI when the AI add-on isn't active -
// shared by both features since they're gated the same way (see
// scripts/077-ai-addon.sql, app/api/dashboard/analytics-summary and
// ai-chat routes).
export function AiAddonRequired() {
  const { t } = useLanguage()
  const tr = t.analytics

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{tr.aiAddonRequiredTitle}</p>
          <p className="mt-1 text-sm text-muted-foreground">{tr.aiAddonRequiredDesc}</p>
        </div>
        <Button asChild size="sm">
          <Link href="/dashboard/settings?tab=plan">{tr.aiAddonRequiredCta}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
