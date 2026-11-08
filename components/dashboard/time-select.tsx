'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// Native <input type="time"> renders in whatever format the visitor's OS
// locale prefers - on a 24h-locale system (the common default in Peru) it
// never shows AM/PM at all, and its look varies a lot across browsers. A
// dropdown of fixed options sidesteps both: always 12h with AM/PM, and
// consistent styling everywhere.
const TIME_OPTIONS: string[] = (() => {
  const opts: string[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return opts
})()

function formatTime12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm
  const period = h < 12 ? 'AM' : 'PM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

// Built once, not on every render. Settings > Negocio has ~16 of these
// (business hours), and Radix renders every option even while closed - so
// rebuilding 96 options each time made typing in ANY field of that page lag.
// Reusing the same elements lets React skip them entirely.
const TIME_ITEMS = TIME_OPTIONS.map((opt) => (
  <SelectItem key={opt} value={opt}>
    {formatTime12h(opt)}
  </SelectItem>
))

interface TimeSelectProps {
  id?: string
  value: string
  onChange: (value: string) => void
  className?: string
}

export function TimeSelect({ id, value, onChange, className }: TimeSelectProps) {
  // Keeps a value that doesn't land on a 15-min mark (an odd time set
  // before this component existed) selectable instead of silently blank.
  const items = TIME_OPTIONS.includes(value)
    ? TIME_ITEMS
    : [...TIME_OPTIONS, value].sort().map((opt) => (
        <SelectItem key={opt} value={opt}>
          {formatTime12h(opt)}
        </SelectItem>
      ))

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className={className}>
        <SelectValue>{formatTime12h(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-64">{items}</SelectContent>
    </Select>
  )
}
