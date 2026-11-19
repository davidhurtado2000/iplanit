import { describe, expect, it } from 'vitest'
import { agendaDateLabel, buildAgendaGroups, buildAgendaHtml, buildAgendaText, type AgendaInput, type AgendaReservation } from './agenda-share'

const tz = 'America/Lima' // UTC-5, no DST
const labels = { unassigned: 'Sin barbero asignado', visit: 'Visita', title: 'Agenda', empty: 'Sin citas para este día.', appointments: 'citas' }
const clients: Record<string, string> = { c1: 'Juan Pérez', c2: 'Luis <script>', c3: 'Ana' }

const res = (over: Partial<AgendaReservation> & { id: string }): AgendaReservation => ({
  start_time: '2026-11-20T14:00:00Z', // 09:00 Lima
  end_time: '2026-11-20T14:45:00Z',
  status: 'confirmed',
  type: 'booking',
  worker_id: 'w1',
  client_id: 'c1',
  service_id: 's1',
  ...over,
})

const input = (reservations: AgendaReservation[], over: Partial<AgendaInput> = {}): AgendaInput => ({
  date: '2026-11-20',
  timezone: tz,
  locale: 'es-PE',
  reservations,
  workers: [{ id: 'w1', name: 'Marcelo' }, { id: 'w2', name: 'Jose' }],
  clientName: (id) => clients[id] ?? '?',
  serviceLabel: () => 'Corte de cabello',
  labels,
  businessName: 'Carppone',
  ...over,
})

describe('buildAgendaGroups', () => {
  it('keeps only that day in the business timezone, sorted by time, grouped by barber', () => {
    const groups = buildAgendaGroups(
      input([
        res({ id: 'b', start_time: '2026-11-20T16:00:00Z' }), // 11:00
        res({ id: 'a', start_time: '2026-11-20T14:00:00Z' }), // 09:00
        res({ id: 'other-day', start_time: '2026-11-21T14:00:00Z' }),
        // 02:00 UTC on the 21st is 21:00 on the 20th in Lima.
        res({ id: 'late', start_time: '2026-11-21T02:00:00Z', worker_id: 'w2' }),
      ])
    )
    expect(groups.map((g) => g.title)).toEqual(['Marcelo', 'Jose'])
    expect(groups[0].lines).toHaveLength(2)
    expect(groups[0].lines[0].time).toMatch(/9:00/)
    expect(groups[0].lines[1].time).toMatch(/11:00/)
    expect(groups[1].lines).toHaveLength(1)
  })

  it('leaves out cancelled and no-show appointments', () => {
    const groups = buildAgendaGroups(input([res({ id: 'a' }), res({ id: 'b', status: 'cancelled' }), res({ id: 'c', status: 'no_show' })]))
    expect(groups[0].lines).toHaveLength(1)
  })

  it('puts appointments without a barber under their own heading', () => {
    const groups = buildAgendaGroups(input([res({ id: 'a', worker_id: null }), res({ id: 'b', worker_id: 'gone' })]))
    expect(groups).toHaveLength(1)
    expect(groups[0].title).toBe('Sin barbero asignado')
    expect(groups[0].lines).toHaveLength(2)
  })

  it('labels a visit instead of a service', () => {
    const groups = buildAgendaGroups(input([res({ id: 'a', type: 'visit', service_id: null })]))
    expect(groups[0].lines[0].service).toBe('Visita')
  })
})

describe('buildAgendaText', () => {
  it('writes a WhatsApp-ready agenda', () => {
    const text = buildAgendaText(input([res({ id: 'a', notes: 'Corte  bajo\ncon degradado' })]))
    expect(text).toContain('*Agenda - Viernes, 20 de noviembre* (Carppone)')
    expect(text).toContain('1 citas')
    expect(text).toContain('*Marcelo* (1)')
    expect(text).toMatch(/• 9:00.*- Juan Pérez · Corte de cabello \(Corte bajo con degradado\)/)
  })

  it('says so when there are no appointments', () => {
    expect(buildAgendaText(input([]))).toContain('Sin citas para este día.')
  })

  it('can show the end time', () => {
    expect(buildAgendaText(input([res({ id: 'a' })], { showEnd: true }))).toMatch(/9:00.* - 9:45/)
  })
})

describe('buildAgendaHtml', () => {
  it('escapes what users typed', () => {
    const html = buildAgendaHtml(input([res({ id: 'a', client_id: 'c2' })]))
    expect(html).toContain('Luis &lt;script&gt;')
    expect(html).not.toContain('<script>')
  })
})

describe('agendaDateLabel', () => {
  it('is capitalized and in the given language', () => {
    expect(agendaDateLabel('2026-11-20', 'es-PE')).toBe('Viernes, 20 de noviembre')
  })
})
