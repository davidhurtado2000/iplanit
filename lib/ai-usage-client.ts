// Client-safe formatting helper, split from lib/ai-usage.ts (which imports
// the Supabase server client and must never end up in the browser bundle).
export function formatResetDate(resetsOn: string | undefined, language: 'es' | 'en'): string {
  if (!resetsOn) return ''
  const date = new Date(resetsOn)
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'es-PE', { month: 'long', day: 'numeric' }).format(date)
}
