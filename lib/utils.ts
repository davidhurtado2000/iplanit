import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Uppercases only the first character - Spanish weekday/month names come
 * lowercase from Intl/toLocaleDateString, but should be capitalized when
 * shown as a standalone label rather than mid-sentence. */
export function capitalizeFirst(str: string): string {
  return str.length > 0 ? str[0].toUpperCase() + str.slice(1) : str
}
