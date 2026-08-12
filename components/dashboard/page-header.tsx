import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Rendered left of the actions, e.g. a search Input - stays fluid width
   * so it doesn't fight the actions for space on a tablet-width screen. */
  search?: ReactNode
  /** One or more Button/PremiumButton elements. Wrapped in flex-wrap so 2-3
   * buttons drop to a second line instead of overflowing a narrow phone -
   * see clients/page.tsx's header, which used to overflow at 375px before
   * this component existed. */
  actions?: ReactNode
  className?: string
}

// Single shared header shape for every dashboard list page - before this,
// clients/services/workers/resources/parking/analytics each built their own
// title+actions row slightly differently (see git history), which read as
// inconsistent between pages and let Clients' 3-button row overflow on
// mobile with nothing to catch it.
export function PageHeader({ title, subtitle, search, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {(search || actions) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {search && <div className="sm:w-64">{search}</div>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
    </div>
  )
}
