/**
 * Locale to use for purely NUMERIC date formatting (day/month/year digits,
 * no month name) - this is where "dd/mm/yyyy" vs "mm/dd/yyyy" actually
 * matters. UI text stays in whatever language the user picked (see
 * useLanguage's `locale`), but the numeric date ORDER should match the
 * business's own country regardless of UI language, since that's the
 * format its owner (and anyone reading a CSV export) actually expects.
 * Formats that spell out the month name (dateStyle: 'long'/'medium', or
 * month: 'long'/'short') aren't ambiguous and should keep using the UI
 * language locale instead - only call this for bare numeric dates.
 */
export function countryDateLocale(country: 'PE' | 'US' | undefined | null): string {
  return country === 'US' ? 'en-US' : 'es-PE'
}
