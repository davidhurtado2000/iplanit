// Who a public booking is attached to (scripts/124). The database does the
// real matching (find_public_client); this file is the readable, tested copy of
// its NAME rule, so the behaviour is specified in one place and the SQL can be
// checked against it (lib/client-match.test.ts, scripts/124 test harness).
//
// The principle: wrongly MERGING two people is far worse than leaving a
// duplicate (a merge puts the wrong name on the appointment, the wrong no-show
// history on the booker and the confirmation in a stranger's inbox; a duplicate
// is joined later). So a phone/email/document match is only trusted when the
// name typed does not clearly contradict the one on file.

const ACCENTS: Record<string, string> = {
  á: 'a', à: 'a', ä: 'a', â: 'a', é: 'e', è: 'e', ë: 'e', ê: 'e',
  í: 'i', ì: 'i', ï: 'i', î: 'i', ó: 'o', ò: 'o', ö: 'o', ô: 'o',
  ú: 'u', ù: 'u', ü: 'u', û: 'u', ñ: 'n',
}

// Particles that say nothing about WHO someone is ("de la Cruz", "Van Dijk").
const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'di', 'van', 'von'])

/** "María José de la Cruz" -> ["maria", "jose", "cruz"], in order. Accents,
 * case, punctuation, one-letter initials and particles are ignored. */
export function clientNameTokens(name: string | null | undefined): string[] {
  const plain = (name ?? '')
    .toLowerCase()
    .replace(/[áàäâéèëêíìïîóòöôúùüûñ]/g, (c) => ACCENTS[c] ?? c)
    .replace(/[^a-z ]/g, ' ')
  return plain.split(/\s+/).filter((t) => t.length >= 2 && !PARTICLES.has(t))
}

/** Could these two names belong to the same person? Errs towards "yes" when
 * unsure, and says "no" only when they clearly differ:
 *  - one of them has no usable words -> yes (nothing to contradict);
 *  - they share a word that is the FIRST word (the given name) of either
 *    -> yes ("Juan Perez" / "Juan Carlos Perez", "Perez Juan", "Ana Maria Lopez"
 *    / "Maria Lopez");
 *  - the first word of one is a shortened form (3+ letters) of a word in the
 *    other -> yes ("Alex" / "Alexander");
 *  - otherwise no. Sharing only a SURNAME is deliberately not enough: that is
 *    exactly a family on one phone ("Maria Lopez" / "Pedro Lopez"). */
export function namesCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = clientNameTokens(a)
  const tb = clientNameTokens(b)
  if (ta.length === 0 || tb.length === 0) return true
  if (tb.includes(ta[0]) || ta.includes(tb[0])) return true
  const shortened = (first: string, other: string[]) =>
    first.length >= 3 && other.some((t) => t.startsWith(first))
  return shortened(ta[0], tb) || shortened(tb[0], ta)
}

export type MatchCandidate = {
  id: string
  name: string
  is_active?: boolean | null
  created_at: string
}

/** The candidate to attach the booking to among those that share a document,
 * email or phone: the compatible ones only; active before inactive, then the
 * oldest, then by id, so the same input always gives the same client (the
 * database used to pick any of them). Null when none is compatible. */
export function pickClientMatch(candidates: MatchCandidate[], typedName: string): MatchCandidate | null {
  const compatible = candidates.filter((c) => namesCompatible(c.name, typedName))
  if (compatible.length === 0) return null
  return [...compatible].sort((x, y) => {
    const activeDiff = Number(y.is_active !== false) - Number(x.is_active !== false)
    if (activeDiff !== 0) return activeDiff
    const t = new Date(x.created_at).getTime() - new Date(y.created_at).getTime()
    return t !== 0 ? t : x.id < y.id ? -1 : 1
  })[0]
}

export type MatchEvidence = 'document' | 'email' | 'phone'

export type MatchOutcome = {
  clientId: string | null
  /** 'document' | 'email' | 'phone' | 'new' | 'new:name_mismatch' */
  reason: string
  /** A document match was rejected by the name: do not copy that document
   * number onto the new client (it would give two clients the same DNI). */
  skipDocument: boolean
}

/** The whole decision, in the order the database applies it: document, then
 * email, then phone. Each evidence only counts if the name is compatible; a
 * rejected one falls through to the next, and if nothing is left a NEW client
 * is created (marked when something was rejected, so it can be reviewed). */
export function decideClient(
  typedName: string,
  byEvidence: Partial<Record<MatchEvidence, MatchCandidate[]>>
): MatchOutcome {
  let rejected = false
  let skipDocument = false
  for (const evidence of ['document', 'email', 'phone'] as MatchEvidence[]) {
    const candidates = byEvidence[evidence] ?? []
    if (candidates.length === 0) continue
    const picked = pickClientMatch(candidates, typedName)
    if (picked) return { clientId: picked.id, reason: evidence, skipDocument: false }
    rejected = true
    if (evidence === 'document') skipDocument = true
  }
  return { clientId: null, reason: rejected ? 'new:name_mismatch' : 'new', skipDocument }
}
