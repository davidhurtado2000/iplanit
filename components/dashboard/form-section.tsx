import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Groups related fields under a labeled heading, so a long form reads as
 * distinct sections instead of one flat stack (first used to break up the
 * Services create/edit modal, now shared with Settings' Profile/Business
 * tabs - same problem, same fix).
 *
 * `bordered` wraps the section in a subtle card-within-a-card panel -
 * opt-in (Settings only, not the Services modal) because a heading alone
 * barely separates from the page in dark mode, where --card is only a
 * touch lighter than --background (see app/globals.css), leaving several
 * settings sections crammed into one Card readable as a single
 * undifferentiated block. The modal's own Dialog chrome already provides
 * that boundary, so it doesn't need this. */
export function FormSection({
  title,
  children,
  bordered = false,
}: {
  title: string
  children: ReactNode
  bordered?: boolean
}) {
  return (
    <div className={cn('space-y-4', bordered && 'rounded-lg border bg-muted/20 p-4')}>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  )
}
