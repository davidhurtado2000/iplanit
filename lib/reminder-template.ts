import { capitalizeFirst } from '@/lib/utils'

export type ReminderLocale = 'es' | 'en'

// Same {client}/{service}/{date}/{time}/{business} vocabulary the manual
// WhatsApp reminder button already used (reservation-modal.tsx) - reused
// here as the ONE placeholder set for both the WhatsApp message and the
// reminder email's custom line, instead of two different ones a business
// would have to learn separately.
export interface ReminderPlaceholderValues {
  client: string
  service: string
  date: string
  time: string
  business: string
}

export function formatReminderDate(startTime: string, timezone: string, locale: ReminderLocale): string {
  const intlLocale = locale === 'en' ? 'en-US' : 'es-PE'
  const formatted = new Date(startTime).toLocaleDateString(intlLocale, {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return capitalizeFirst(formatted)
}

export function formatReminderTime(startTime: string, timezone: string, locale: ReminderLocale): string {
  const intlLocale = locale === 'en' ? 'en-US' : 'es-PE'
  return new Date(startTime).toLocaleTimeString(intlLocale, {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  })
}

// A business's own free-text template can carry any/none of the tokens, in
// any order, any number of times - replaceAll rather than a single
// replace() so a repeated {client} (or a template missing one entirely)
// both just work instead of only the first occurrence landing.
export function applyReminderPlaceholders(template: string, values: ReminderPlaceholderValues): string {
  return template
    .replaceAll('{client}', values.client)
    .replaceAll('{service}', values.service)
    .replaceAll('{date}', values.date)
    .replaceAll('{time}', values.time)
    .replaceAll('{business}', values.business)
}
