// Keys must match scripts/106-reservation-payment-method.sql's check
// constraint. Brand names (Yape, Visa, Zelle...) are proper nouns and read
// the same in both languages; only the generic ones are translated.
export type PaymentMethod =
  | 'cash'
  | 'yape'
  | 'plin'
  | 'visa'
  | 'mastercard'
  | 'amex'
  | 'discover'
  | 'transfer'
  | 'venmo'
  | 'zelle'
  | 'cashapp'
  | 'apple_pay'
  | 'paypal'
  | 'other'

const BY_COUNTRY: Record<'PE' | 'US', PaymentMethod[]> = {
  PE: ['cash', 'yape', 'plin', 'visa', 'mastercard', 'amex', 'transfer', 'other'],
  US: ['cash', 'visa', 'mastercard', 'amex', 'discover', 'venmo', 'zelle', 'cashapp', 'apple_pay', 'paypal', 'other'],
}

const BRAND_LABELS: Partial<Record<PaymentMethod, string>> = {
  yape: 'Yape',
  plin: 'Plin',
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  venmo: 'Venmo',
  zelle: 'Zelle',
  cashapp: 'Cash App',
  apple_pay: 'Apple Pay',
  paypal: 'PayPal',
}

export function paymentMethodsFor(country: string | null | undefined): PaymentMethod[] {
  return BY_COUNTRY[country === 'US' ? 'US' : 'PE']
}

export function paymentMethodLabel(
  method: string,
  generic: { cash: string; transfer: string; other: string }
): string {
  if (method === 'cash' || method === 'transfer' || method === 'other') return generic[method]
  return BRAND_LABELS[method as PaymentMethod] ?? method
}
