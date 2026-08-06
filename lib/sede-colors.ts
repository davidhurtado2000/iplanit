// Vista expandida (scripts/053-organizations-and-sedes.sql) sede indicator
// helpers - shared by the calendar (day/week/month/list headers), the
// clients page (sede-de-origen badge) and Settings' Team roster (per-sede
// badges). Kept in one place so every "which sede is this" chip in the
// dashboard looks and behaves the same.

export function sedeAbbr(name: string): string {
  return name.trim().slice(0, 2).toUpperCase()
}

// Subtle per-sede tint palette, deliberately separate from
// SERVICE_COLORS/RESOURCE_COLORS (services/page.tsx, resources/page.tsx) -
// those are bold, user-picked colors that fill an actual reservation
// block; these are a soft wash reserved for sede header/badge chrome only,
// never a block fill, so the two systems can never be confused for one
// another the way VISIT_BLOCK_COLOR once collided with a service color.
// Same light/dark pairing convention already used for HeroKpiCard icons
// elsewhere in the dashboard.
export const SEDE_TINTS = [
  { bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-900' },
  { bg: 'bg-violet-50 dark:bg-violet-950/40', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-200 dark:border-violet-900' },
  { bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-900' },
  { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-900' },
  { bg: 'bg-pink-50 dark:bg-pink-950/40', text: 'text-pink-700 dark:text-pink-300', border: 'border-pink-200 dark:border-pink-900' },
  { bg: 'bg-cyan-50 dark:bg-cyan-950/40', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-200 dark:border-cyan-900' },
]

export function sedeTint(colorIndex: number | undefined) {
  if (colorIndex === undefined) return null
  return SEDE_TINTS[colorIndex % SEDE_TINTS.length]
}

/** Stable per-sede color index keyed by business_id, in a fixed order (e.g. `businesses` sorted by created_at). */
export function buildBusinessColorIndex(businessIds: string[]): Record<string, number> {
  return Object.fromEntries(businessIds.map((id, i) => [id, i]))
}
