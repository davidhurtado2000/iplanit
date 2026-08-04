import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

/**
 * Headline metric card - a number a user should see at a glance, with an
 * icon in a colored chip instead of a plain muted-gray icon (that flat
 * style is what this replaced on both Analytics and Clients - see
 * git history on those pages for the "before"). `trend` takes pre-rendered
 * content (e.g. a page's own TrendBadge) rather than a trend value/type
 * itself, so this component doesn't need to know anything about how any
 * particular page computes or displays trends.
 */
export function HeroKpiCard({
  label,
  icon: Icon,
  iconClassName,
  value,
  trend,
  caption,
  className,
}: {
  label: string
  icon: LucideIcon
  iconClassName: string
  value: ReactNode
  trend?: ReactNode
  caption?: ReactNode
  /** Extra classes on the Card itself - e.g. a hover affordance when a
   * caller wraps this in a Link, since the card has no way to know on its
   * own whether it's clickable. */
  className?: string
}) {
  return (
    <Card className={className}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', iconClassName)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight">{value}</span>
          {trend}
        </div>
        {caption && <p className="mt-1 truncate text-xs text-muted-foreground">{caption}</p>}
      </CardContent>
    </Card>
  )
}
