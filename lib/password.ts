export type PasswordChecks = {
  length: boolean
  uppercase: boolean
  lowercase: boolean
  number: boolean
  special: boolean
}

export function getPasswordChecks(password: string): PasswordChecks {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  }
}

export const PASSWORD_REQUIREMENT_KEYS: (keyof PasswordChecks)[] = [
  'length',
  'uppercase',
  'lowercase',
  'number',
  'special',
]

export type PasswordStrength = 'weak' | 'medium' | 'strong'

export function getPasswordStrength(checks: PasswordChecks): PasswordStrength {
  const coreCount = [checks.length, checks.uppercase, checks.lowercase, checks.number].filter(Boolean).length
  if (coreCount <= 1) return 'weak'
  if (coreCount <= 3) return 'medium'
  return checks.special ? 'strong' : 'medium'
}

export function isPasswordStrongEnough(checks: PasswordChecks) {
  return checks.length && checks.uppercase && checks.lowercase && checks.number
}
