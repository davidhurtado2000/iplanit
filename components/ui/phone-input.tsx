'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export type PhoneCountry = 'US' | 'PE'

const COUNTRIES: { code: PhoneCountry; flag: string; dialCode: string; nationalLength: number }[] = [
  { code: 'US', flag: '🇺🇸', dialCode: '1', nationalLength: 10 },
  { code: 'PE', flag: '🇵🇪', dialCode: '51', nationalLength: 9 },
]

function meta(code: PhoneCountry) {
  return COUNTRIES.find((c) => c.code === code)!
}

function formatNational(code: PhoneCountry, digits: string) {
  if (code === 'US') {
    const area = digits.slice(0, 3)
    const mid = digits.slice(3, 6)
    const last = digits.slice(6, 10)
    if (digits.length > 6) return `(${area}) ${mid}-${last}`
    if (digits.length > 3) return `(${area}) ${mid}`
    if (digits.length > 0) return `(${area}`
    return ''
  }
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)].filter(Boolean).join(' ')
}

// Recognizes a value this component itself would have produced: a
// supported country's dial code followed by nothing but digits. Used to
// restore the country toggle + digits when the parent hands back a stored
// value (editing an existing client). Anything else is left alone and
// edited as plain text so we never mangle a foreign number or legacy free
// text that predates this component.
function recognize(trimmed: string): { country: PhoneCountry; digits: string } | null {
  if (!trimmed.startsWith('+')) return null
  for (const c of COUNTRIES) {
    const prefix = `+${c.dialCode}`
    if (trimmed.startsWith(prefix)) {
      const rest = trimmed.slice(prefix.length)
      if (/^\d*$/.test(rest) && rest.length <= c.nationalLength) {
        return { country: c.code, digits: rest }
      }
    }
  }
  return null
}

type Resolved =
  | { mode: 'masked'; country: PhoneCountry; digits: string }
  | { mode: 'raw'; raw: string }

function resolveValue(value: string, defaultCountry: PhoneCountry): Resolved {
  const trimmed = value.trim()
  if (!trimmed) return { mode: 'masked', country: defaultCountry, digits: '' }

  const recognized = recognize(trimmed)
  if (recognized) return { mode: 'masked', ...recognized }

  // Bare local number with no country code, e.g. from data entered before
  // this component existed - assume it belongs to the business's own
  // country, same prior normalize_phone_for_matching (script 044) already
  // uses for dedupe matching.
  if (!trimmed.startsWith('+') && /^[0-9()\-.\s]+$/.test(trimmed)) {
    const digits = trimmed.replace(/\D/g, '')
    if (digits.length === meta(defaultCountry).nationalLength) {
      return { mode: 'masked', country: defaultCountry, digits }
    }
  }

  return { mode: 'raw', raw: value }
}

interface PhoneInputProps {
  id?: string
  value: string
  onChange: (value: string) => void
  defaultCountry?: PhoneCountry
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function PhoneInput({
  id,
  value,
  onChange,
  defaultCountry = 'PE',
  placeholder,
  className,
  disabled,
}: PhoneInputProps) {
  const lastEmitted = React.useRef<string | null>(null)
  const initial = resolveValue(value, defaultCountry)

  const [mode, setMode] = React.useState<'masked' | 'raw'>(initial.mode)
  const [country, setCountry] = React.useState<PhoneCountry>(initial.mode === 'masked' ? initial.country : defaultCountry)
  const [digits, setDigits] = React.useState<string>(initial.mode === 'masked' ? initial.digits : '')
  const [raw, setRaw] = React.useState<string>(initial.mode === 'raw' ? initial.raw : '')

  // Only resync from props when the parent hands back a value we didn't
  // just emit ourselves - e.g. switching which client is being edited, or
  // a form reset. Otherwise this would fight every keystroke below. Also
  // reruns when defaultCountry changes (e.g. currentBusiness finishes
  // loading after this mounted) so an untouched/empty field still picks up
  // the right country - but the lastEmitted guard above still protects a
  // value the user actually typed from being reinterpreted underneath them.
  React.useEffect(() => {
    if (value === lastEmitted.current) return
    const resolved = resolveValue(value, defaultCountry)
    setMode(resolved.mode)
    if (resolved.mode === 'masked') {
      setCountry(resolved.country)
      setDigits(resolved.digits)
    } else {
      setRaw(resolved.raw)
    }
  }, [value, defaultCountry])

  function emit(next: string) {
    lastEmitted.current = next
    onChange(next)
  }

  function handleCountryClick(code: PhoneCountry) {
    setMode('masked')
    setCountry(code)
    const clipped = digits.slice(0, meta(code).nationalLength)
    setDigits(clipped)
    emit(clipped ? `+${meta(code).dialCode}${clipped}` : '')
  }

  function handleMaskedChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value
    if (next.trim().startsWith('+')) {
      // Typing a full international number for some other country -
      // stop masking and pass it through untouched.
      setMode('raw')
      setRaw(next)
      emit(next)
      return
    }
    const d = next.replace(/\D/g, '').slice(0, meta(country).nationalLength)
    setDigits(d)
    emit(d ? `+${meta(country).dialCode}${d}` : '')
  }

  function handleRawChange(e: React.ChangeEvent<HTMLInputElement>) {
    setRaw(e.target.value)
    emit(e.target.value)
  }

  return (
    <div
      className={cn(
        'flex h-9 items-stretch rounded-md border border-input shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30',
        disabled && 'pointer-events-none cursor-not-allowed opacity-50',
        className,
      )}
    >
      <div className="flex items-center gap-0.5 border-r border-input pl-1.5 pr-1">
        {COUNTRIES.map((c) => (
          <button
            key={c.code}
            type="button"
            disabled={disabled}
            onClick={() => handleCountryClick(c.code)}
            aria-pressed={mode === 'masked' && country === c.code}
            aria-label={`${c.code} +${c.dialCode}`}
            className={cn(
              'flex items-center gap-1 rounded px-1.5 py-0.5 text-sm transition-colors',
              mode === 'masked' && country === c.code
                ? 'bg-muted font-medium'
                : 'text-muted-foreground hover:bg-muted/50',
            )}
          >
            <span>{c.flag}</span>
            <span>+{c.dialCode}</span>
          </button>
        ))}
      </div>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        disabled={disabled}
        value={mode === 'masked' ? formatNational(country, digits) : raw}
        onChange={mode === 'masked' ? handleMaskedChange : handleRawChange}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent px-3 py-1 text-base outline-none placeholder:text-muted-foreground md:text-sm"
      />
    </div>
  )
}
