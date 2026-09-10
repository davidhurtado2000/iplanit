// Builds a wa.me deep link - opens WhatsApp (app or web) straight into a
// chat with this number, optionally with a message pre-filled in the
// composer (still requires the user to hit send; WhatsApp has no API for
// actually sending on someone's behalf without a business account like
// Twilio's). Bare local numbers with no country code are assumed to be
// Peru, same convention normalize_phone_for_matching (scripts/044) already
// uses for the business's own country - numbers entered through
// components/ui/phone-input.tsx already carry a real country code, so this
// fallback only matters for legacy/CSV-imported numbers.
export function getWhatsappLink(phone: string, message?: string): string {
  const digits = phone.replace(/\D/g, '')
  const withCountry = digits.length <= 9 ? `51${digits}` : digits
  const base = `https://wa.me/${withCountry}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}
