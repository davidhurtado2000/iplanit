/**
 * Converts a UTC ISO timestamp to "YYYY-MM-DDTHH:MM" expressed in the given
 * IANA timezone. Used to populate datetime-local inputs with the correct
 * business-timezone time regardless of the browser's own timezone.
 */
export function toTzLocalInput(utcString: string, timezone: string): string {
  const d = new Date(utcString)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]))
  const h = p.hour === '24' ? '00' : p.hour
  return `${p.year}-${p.month}-${p.day}T${h}:${p.minute}`
}

/**
 * Interprets "YYYY-MM-DDTHH:MM" as a wall-clock time in the given IANA
 * timezone and returns the corresponding UTC Date.
 * This is browser-timezone-independent — it always uses the business timezone.
 */
export function parseInTimezone(localString: string, timezone: string): Date {
  // Treat the string as UTC first (no browser-tz conversion happens with 'Z')
  const fakeUtc = new Date(localString + ':00Z')
  // Find out what wall-clock time that UTC moment shows in the target timezone
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(fakeUtc)
  const p = Object.fromEntries(parts.map(x => [x.type, Number(x.value)]))
  const tzAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute)
  // Shift fakeUtc by the difference so the wall-clock time matches localString
  return new Date(fakeUtc.getTime() + (fakeUtc.getTime() - tzAsUtc))
}

/** Returns "YYYY-MM-DD" for a Date or ISO string expressed in the given IANA timezone. */
export function toDateStr(date: Date | string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(
    typeof date === 'string' ? new Date(date) : date
  )
}

/** Returns the local hour and minute of a UTC ISO string in the given IANA timezone. */
export function getTzHourMin(timeStr: string, tz: string): { h: number; m: number } {
  const d = new Date(timeStr)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(d)
  const p = Object.fromEntries(parts.map(x => [x.type, Number(x.value)]))
  return { h: p.hour % 24, m: p.minute }
}

/** JS Date#getDay() (0=Sun..6=Sat) for a date string, evaluated in the given IANA timezone. */
export function getTzDayOfWeek(dateStr: string, tz: string): number {
  const jsDate = new Date(dateStr + 'T12:00:00Z') // noon UTC avoids DST edge cases
  const dayOfWeek = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(jsDate)
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return dayMap[dayOfWeek] ?? jsDate.getDay()
}
