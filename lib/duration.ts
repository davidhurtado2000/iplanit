// "90 min" reads worse than "1h 30min" once a duration crosses an hour -
// used anywhere a stored duration_minutes value is shown as plain text.
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}min`
}
