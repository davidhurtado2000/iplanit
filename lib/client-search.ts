// One client search shared by the Clients page and the reservation modal's
// pickers: name, email, document number and - new - phone, matched by digits
// so "987 654 321", "+51987654321" and "987654321" all find the same person
// (at a barbershop the front desk usually asks for the phone).
type SearchableClient = {
  name: string
  email?: string | null
  phone?: string | null
  document_number?: string | null
}

export function matchesClientSearch(client: SearchableClient, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (client.name.toLowerCase().includes(q)) return true
  if (client.email && client.email.toLowerCase().includes(q)) return true
  if (client.document_number && client.document_number.toLowerCase().includes(q)) return true
  const digits = q.replace(/\D/g, '')
  if (digits.length >= 3 && client.phone && client.phone.replace(/\D/g, '').includes(digits)) return true
  return false
}

// Pickers show at most this many rows: rendering thousands of options at once
// (a business that imported its whole client base) made the modal lag. Typing
// narrows it down; the hint below the list says so.
export const MAX_CLIENT_PICKER_RESULTS = 50
