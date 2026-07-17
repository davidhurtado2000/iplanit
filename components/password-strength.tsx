'use client'

import { Check, X } from 'lucide-react'
import { getPasswordChecks, getPasswordStrength, PASSWORD_REQUIREMENT_KEYS } from '@/lib/password'

interface PasswordStrengthProps {
  password: string
  labels: {
    weak: string
    medium: string
    strong: string
    length: string
    uppercase: string
    lowercase: string
    number: string
    special: string
  }
}

export function PasswordStrength({ password, labels }: PasswordStrengthProps) {
  if (!password) return null

  const checks = getPasswordChecks(password)
  const strength = getPasswordStrength(checks)

  return (
    <div className="space-y-1.5 rounded-md border bg-muted/40 p-3">
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all ${
              strength === 'strong'
                ? 'w-full bg-green-500'
                : strength === 'medium'
                  ? 'w-2/3 bg-yellow-500'
                  : 'w-1/3 bg-destructive'
            }`}
          />
        </div>
        <span className="text-xs font-medium text-muted-foreground">{labels[strength]}</span>
      </div>
      <ul className="grid grid-cols-1 gap-1 pt-1 sm:grid-cols-2">
        {PASSWORD_REQUIREMENT_KEYS.map((key) => (
          <li key={key} className="flex items-center gap-1.5 text-xs">
            {checks[key] ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
            ) : (
              <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className={checks[key] ? 'text-foreground' : 'text-muted-foreground'}>{labels[key]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
