import { describe, expect, it } from 'vitest'
import { buildPushMessage, pickRecipients } from './message'

const base = {
  language: 'es' as const,
  clientName: 'Juan Pérez',
  serviceName: 'Corte + Barba',
  startTime: '2026-11-20T21:00:00Z', // 4:00 pm in Lima
  timezone: 'America/Lima',
}

describe('buildPushMessage', () => {
  it('announces a new booking with client, service, time and barber', () => {
    const m = buildPushMessage({ ...base, kind: 'new', workerName: 'Marcelo' })
    expect(m.title).toBe('Nueva reserva')
    expect(m.body).toContain('Juan Pérez')
    expect(m.body).toContain('Corte + Barba')
    expect(m.body).toContain('Marcelo')
    expect(m.body).toMatch(/4:00/) // business timezone, not UTC
  })

  it('says when a booking still needs confirming', () => {
    expect(buildPushMessage({ ...base, kind: 'new', pending: true }).title).toBe('Nueva reserva por confirmar')
  })

  it('announces a cancellation', () => {
    expect(buildPushMessage({ ...base, kind: 'cancelled' }).title).toBe('Reserva cancelada')
  })

  it('speaks the business language', () => {
    expect(buildPushMessage({ ...base, language: 'en', kind: 'new' }).title).toBe('New booking')
  })

  it('skips what is missing instead of printing "null"', () => {
    const m = buildPushMessage({ ...base, kind: 'new', serviceName: null, workerName: null })
    expect(m.body).not.toMatch(/null|undefined| · $/)
  })
})

describe('pickRecipients', () => {
  it('sends to the owner and the team, once each', () => {
    expect(pickRecipients({ ownerId: 'o', memberIds: ['a', 'o', 'b'] }).staff).toEqual(['o', 'a', 'b'])
  })

  it('adds the assigned barber when they have an account and are not staff', () => {
    expect(pickRecipients({ ownerId: 'o', memberIds: [], workerUserId: 'w' })).toEqual({ staff: ['o'], worker: ['w'] })
  })

  it('does not notify a barber twice when they are also staff', () => {
    expect(pickRecipients({ ownerId: 'o', memberIds: ['w'], workerUserId: 'w' }).worker).toEqual([])
  })

  it('has nobody to tell when nobody is set up', () => {
    expect(pickRecipients({ ownerId: null, memberIds: [] })).toEqual({ staff: [], worker: [] })
  })
})
