import type { InvoiceCustomerDocType } from './types'

export function isValidDni(value: string): boolean {
  return /^\d{8}$/.test(value)
}

// RUC: 11 digits, a valid prefix (10 persona natural, 15/17 other natural
// persons, 20 persona jurídica) and SUNAT's check digit.
export function isValidRuc(value: string): boolean {
  if (!/^(10|15|17|20)\d{9}$/.test(value)) return false
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const sum = weights.reduce((acc, w, i) => acc + w * Number(value[i]), 0)
  const rest = 11 - (sum % 11)
  const check = rest === 10 ? 0 : rest === 11 ? 1 : rest
  return check === Number(value[10])
}

// Maps the client's document (clients.document_type / document_number) to a
// SUNAT document type (catálogo 06). The public booking page saves any
// document as 'dni' (scripts/064), so an 11-digit number is checked as a RUC
// regardless of the stored type. Returns null when there's no usable document.
export function toSunatDocument(
  documentType: string | null | undefined,
  documentNumber: string | null | undefined,
): { docType: InvoiceCustomerDocType; docNumber: string } | null {
  const number = (documentNumber ?? '').replace(/[\s.-]/g, '').toUpperCase()
  if (!number) return null

  if (/^\d{11}$/.test(number)) {
    return isValidRuc(number) ? { docType: '6', docNumber: number } : null
  }

  switch (documentType) {
    case 'dni':
      return isValidDni(number) ? { docType: '1', docNumber: number } : null
    case 'ce':
      return /^[A-Z0-9]{8,12}$/.test(number) ? { docType: '4', docNumber: number } : null
    case 'passport':
      return /^[A-Z0-9]{5,12}$/.test(number) ? { docType: '7', docNumber: number } : null
    default:
      return null
  }
}

// For logs: never write a full DNI/RUC.
export function maskDocument(value: string | null | undefined): string {
  if (!value) return ''
  return value.length <= 4 ? '****' : `****${value.slice(-4)}`
}

// SUNAT catálogo 09 (credit note reasons) - the ones a service business uses.
export const CREDIT_NOTE_REASONS = {
  '01': 'Anulación de la operación',
  '02': 'Anulación por error en el RUC',
  '03': 'Corrección por error en la descripción',
  '04': 'Descuento global',
  '06': 'Devolución total',
} as const

export type CreditNoteReasonCode = keyof typeof CREDIT_NOTE_REASONS

// Date as YYYY-MM-DD in Lima (comprobantes are dated in Peru time, not UTC).
export function limaDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

// DD/MM/YYYY in Lima, for item descriptions.
export function limaDateDisplay(date: Date): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}
