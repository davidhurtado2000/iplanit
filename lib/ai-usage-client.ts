// Client-safe formatting helper, split from lib/ai-usage.ts (which imports
// the Supabase server client and must never end up in the browser bundle).
export function formatResetDate(resetsOn: string | undefined, language: 'es' | 'en'): string {
  if (!resetsOn) return ''
  const date = new Date(resetsOn)
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'es-PE', { month: 'long', day: 'numeric' }).format(date)
}

/**
 * Single source of truth for "can this account use the AI add-on right
 * now" - used both client-side (sidebar, mobile nav, Dashboard/Analytics/
 * Settings pages) and server-side (the ai-chat/analytics-summary routes),
 * so the three ways in can never drift apart. ai_addon_access_until
 * (scripts/078) covers the grace period after cancelling: deactivating
 * stops billing right away but access itself continues until the period
 * already paid for actually ends, same as cancelling any other
 * subscription - see app/api/stripe/ai-addon/deactivate.
 */
export function isAiAddonActive(
  profile:
    | {
        ai_addon_active?: boolean | null
        ai_addon_override?: boolean | null
        ai_addon_access_until?: string | null
      }
    | null
    | undefined
): boolean {
  if (!profile) return false
  if (profile.ai_addon_override) return true
  if (profile.ai_addon_active) return true
  return !!profile.ai_addon_access_until && new Date(profile.ai_addon_access_until).getTime() > Date.now()
}
