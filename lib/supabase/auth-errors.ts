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
 * supabase-js serializes auth calls (signIn, signUp, updateUser, ...) behind
 * a browser NavigatorLock so concurrent requests don't corrupt the stored
 * session. This lock is shared by every tab open on the same site, not just
 * the current one - if the user has iPlanit open in another tab that's
 * mid-refresh, this call can lose the race and throw instead of just
 * waiting, surfacing as "NavigatorLockAcquireTimeoutError" / "Lock ... was
 * released because another request stole it". A single retry isn't always
 * enough if the other tab keeps re-acquiring it, so this retries a few
 * times with backoff before giving up.
 */
export function isAuthLockError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /navigatorlock|lock.*stolen|acquire.*lock/i.test(message)
}

export async function withAuthLockRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (!isAuthLockError(err) || attempt === maxAttempts) throw err
      await new Promise((resolve) => setTimeout(resolve, attempt * 400))
    }
  }
  // Unreachable - the loop always returns or throws - but keeps TypeScript happy.
  throw new Error('withAuthLockRetry: exhausted attempts')
}

/**
 * Seen in the wild: updateUser() successfully changes the password server
 * side (confirmed directly in Supabase), but the client-side promise never
 * settles - so the UI sits on a spinner forever even though the work is
 * already done. Racing the call against a timeout turns an infinite hang
 * into an actionable message instead of leaving the user stuck.
 */
export class AuthTimeoutError extends Error {
  constructor() {
    super('Auth request timed out')
    this.name = 'AuthTimeoutError'
  }
}

export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AuthTimeoutError()), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer!)
  }
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
