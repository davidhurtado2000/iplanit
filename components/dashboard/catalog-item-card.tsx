import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * Shared shell for the Services/Resources/Workers catalog grids - before
 * this, each of those three pages hand-rolled the same Card + color strip
 * + CardContent wrapper independently (same className strings, copy-pasted
 * three times). Only the genuinely identical chrome lives here; the actual
 * content (name, description, badges, footer) still varies per page and is
 * passed as children, same as Card/CardContent themselves work.
 */
export function CatalogItemCard({
  color,
  isActive,
  onClick,
  children,
}: {
  /** The item's own user-set color - drives both the top strip and (via
   * CatalogItemIcon) the icon chip, so a card's color always ties back to
   * the same value shown in Calendar/Analytics for that same service or
   * resource. */
  color: string
  isActive: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Card
      className={cn(
        'flex h-full cursor-pointer flex-col gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md',
        !isActive && 'opacity-70'
      )}
      onClick={onClick}
    >
      <div className="h-1.5 w-full" style={{ backgroundColor: color }} />
      <CardContent className="flex flex-1 flex-col justify-between gap-4 p-5">{children}</CardContent>
    </Card>
  )
}

/** The icon chip used by Resources/Workers cards (Services shows no icon).
 * Tinted at 20% of the item's own color rather than a fixed hue, so it
 * always matches that specific item instead of an arbitrary palette. */
export function CatalogItemIcon({ icon: Icon, color }: { icon: LucideIcon; color: string }) {
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: `${color}20`, color }}
    >
      <Icon className="h-4 w-4" />
    </div>
  )
}
