import type { Language } from '@/context/language-context'

const MESSAGES = {
  es: {
    invalidCredentials: 'Correo o contraseña incorrectos',
    emailNotConfirmed: 'Debes confirmar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.',
    userAlreadyRegistered: 'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.',
    weakPassword: 'La contraseña no cumple los requisitos mínimos de seguridad',
    invalidEmail: 'El formato del correo no es válido',
    rateLimited: 'Demasiados intentos. Espera unos minutos antes de volver a intentar.',
    userNotFound: 'No encontramos una cuenta con ese correo',
    invalidOrExpiredToken: 'El enlace expiró o no es válido. Solicita uno nuevo.',
    samePassword: 'La nueva contraseña debe ser diferente a la anterior',
    generic: 'Ocurrió un error. Intenta de nuevo.',
  },
  en: {
    invalidCredentials: 'Incorrect email or password',
    emailNotConfirmed: 'Please confirm your email before signing in. Check your inbox.',
    userAlreadyRegistered: 'That email already has an account. Sign in or reset your password.',
    weakPassword: 'Password does not meet the minimum security requirements',
    invalidEmail: 'That email address is not valid',
    rateLimited: 'Too many attempts. Please wait a few minutes and try again.',
    userNotFound: "We couldn't find an account with that email",
    invalidOrExpiredToken: 'This link has expired or is invalid. Please request a new one.',
    samePassword: 'The new password must be different from the previous one',
    generic: 'Something went wrong. Please try again.',
  },
} as const satisfies Record<Language, Record<string, string>>

/**
 * Supabase/GoTrue auth error messages are always returned in English —
 * there's no server-side i18n for them regardless of the app's locale.
 * This matches on the substrings it's known to send and remaps to the
 * app's own copy in the active language, so raw English never leaks
 * into a Spanish (or vice versa) UI. Unrecognized messages fall back to
 * a translated generic message rather than showing the raw string.
 */
export function translateAuthError(rawMessage: string | undefined | null, language: Language): string {
  const m = MESSAGES[language]
  const raw = (rawMessage || '').toLowerCase()

  if (raw.includes('invalid login credentials')) return m.invalidCredentials
  if (raw.includes('email not confirmed')) return m.emailNotConfirmed
  if (raw.includes('already registered') || raw.includes('already exists')) return m.userAlreadyRegistered
  if (
    raw.includes('password should be at least') ||
    raw.includes('password should contain') ||
    raw.includes('requires a valid password')
  )
    return m.weakPassword
  if (raw.includes('unable to validate email') || raw.includes('invalid email')) return m.invalidEmail
  if (raw.includes('rate limit') || raw.includes('security purposes')) return m.rateLimited
  if (raw.includes('user not found')) return m.userNotFound
  if (raw.includes('token has expired') || raw.includes('invalid token') || raw.includes('otp expired'))
    return m.invalidOrExpiredToken
  if (raw.includes('different from the old password') || raw.includes('should be different')) return m.samePassword

  return m.generic
}

/**
 * Detects Supabase's anti-enumeration signal for signUp(): when an email is
 * already registered, it returns a `user` object with an empty `identities`
 * array instead of a clear error, so this has to be checked separately from
 * translateAuthError().
 */
export function isDuplicateSignupUser(user: { identities?: unknown[] | null } | null | undefined): boolean {
  return Boolean(user && user.identities && user.identities.length === 0)
}
