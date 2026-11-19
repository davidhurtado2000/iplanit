// "Compartir agenda": a day's appointments as plain text (WhatsApp-ready) and
// as a printable page, so the day's agenda can be sent complete instead of as
// a screenshot that cuts off. Pure - no database, no browser APIs - so it is
// easy to test; the dialog (components/dashboard/share-agenda-dialog.tsx)
// feeds it the data the calendar already has.

export interface AgendaReservation {
  id: string
  start_time: string
  end_time: string
  status: string
  type: string
  worker_id: string | null
  client_id: string
  service_id: string | null
  notes?: string | null
}

export interface AgendaLabels {
  /** "Sin barbero asignado" */
  unassigned: string
  /** "Visita" - shown instead of a service for a visit. */
  visit: string
  /** "Agenda" */
  title: string
  /** "Sin citas para este día." */
  empty: string
  /** "citas" / "cita" is built by the caller; this is the plural word. */
  appointments: string
}

export interface AgendaInput {
  /** YYYY-MM-DD in the business timezone. */
  date: string
  timezone: string
  locale: string
  reservations: AgendaReservation[]
  workers: { id: string; name: string }[]
  clientName: (clientId: string) => string
  /** Main service plus extras, already joined ("Corte + Barba"). */
  serviceLabel: (reservation: AgendaReservation) => string
  labels: AgendaLabels
  /** Show the end time too ("9:00 - 9:45")? */
  showEnd?: boolean
  businessName?: string
}

export interface AgendaLine {
  time: string
  client: string
  service: string
  notes: string
}

export interface AgendaGroup {
  /** Worker name, or the "unassigned" label. */
  title: string
  lines: AgendaLine[]
}

const dayOf = (iso: string, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso))

function timeLabel(iso: string, tz: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale, { timeZone: tz, hour: 'numeric', minute: '2-digit' })
}

/** The appointments of one day, grouped by barber (in the order the barbers
 * are listed), each group sorted by time. Cancelled ones and no-shows are
 * left out: the agenda is who is coming. */
export function buildAgendaGroups(input: AgendaInput): AgendaGroup[] {
  const { date, timezone: tz, locale } = input
  const todays = input.reservations
    .filter((r) => dayOf(r.start_time, tz) === date && r.status !== 'cancelled' && r.status !== 'no_show')
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

  const lineOf = (r: AgendaReservation): AgendaLine => ({
    time: input.showEnd
      ? `${timeLabel(r.start_time, tz, locale)} - ${timeLabel(r.end_time, tz, locale)}`
      : timeLabel(r.start_time, tz, locale),
    client: input.clientName(r.client_id),
    service: r.type === 'visit' ? input.labels.visit : input.serviceLabel(r),
    notes: (r.notes ?? '').trim(),
  })

  const groups: AgendaGroup[] = []
  for (const worker of input.workers) {
    const lines = todays.filter((r) => r.worker_id === worker.id).map(lineOf)
    if (lines.length > 0) groups.push({ title: worker.name, lines })
  }
  const known = new Set(input.workers.map((w) => w.id))
  const loose = todays.filter((r) => !r.worker_id || !known.has(r.worker_id)).map(lineOf)
  if (loose.length > 0) groups.push({ title: input.labels.unassigned, lines: loose })
  return groups
}

/** "jueves, 20 de noviembre" - capitalized, in the business language. */
export function agendaDateLabel(date: string, locale: string): string {
  const label = new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** The agenda as WhatsApp-style text (*bold* is WhatsApp's markup). */
export function buildAgendaText(input: AgendaInput): string {
  const groups = buildAgendaGroups(input)
  const head = `*${input.labels.title} - ${agendaDateLabel(input.date, input.locale)}*${input.businessName ? ` (${input.businessName})` : ''}`
  if (groups.length === 0) return `${head}\n\n${input.labels.empty}`
  const total = groups.reduce((n, g) => n + g.lines.length, 0)
  const body = groups
    .map((g) => {
      const lines = g.lines.map((l) => {
        const note = l.notes ? ` (${l.notes.replace(/\s+/g, ' ')})` : ''
        return `• ${l.time} - ${l.client}${l.service ? ` · ${l.service}` : ''}${note}`
      })
      return `*${g.title}* (${g.lines.length})\n${lines.join('\n')}`
    })
    .join('\n\n')
  return `${head}\n${total} ${input.labels.appointments}\n\n${body}`
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A self-contained, printable page: the browser's print dialog turns it into
 * a PDF ("Guardar como PDF"). Everything is escaped - client names and notes
 * come from users. */
export function buildAgendaHtml(input: AgendaInput): string {
  const groups = buildAgendaGroups(input)
  const title = `${input.labels.title} - ${agendaDateLabel(input.date, input.locale)}`
  const sections = groups.length
    ? groups
        .map(
          (g) => `
    <h2>${escapeHtml(g.title)} <span>(${g.lines.length})</span></h2>
    <table>
      ${g.lines
        .map(
          (l) =>
            `<tr><td class="t">${escapeHtml(l.time)}</td><td>${escapeHtml(l.client)}</td><td>${escapeHtml(l.service)}</td><td class="n">${escapeHtml(l.notes)}</td></tr>`
        )
        .join('\n      ')}
    </table>`
        )
        .join('\n')
    : `<p>${escapeHtml(input.labels.empty)}</p>`
  return `<!doctype html>
<html lang="${escapeHtml(input.locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; color: #111; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #555; margin: 0 0 16px; font-size: 13px; }
  h2 { font-size: 16px; margin: 20px 0 6px; border-bottom: 2px solid #111; padding-bottom: 2px; }
  h2 span { font-weight: normal; color: #555; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  td { padding: 5px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
  td.t { white-space: nowrap; font-weight: 600; width: 1%; }
  td.n { color: #555; font-size: 12px; }
  @media print { body { margin: 12px; } h2 { break-after: avoid; } tr { break-inside: avoid; } }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="sub">${escapeHtml(input.businessName ?? '')}</p>
${sections}
</body>
</html>`
}
