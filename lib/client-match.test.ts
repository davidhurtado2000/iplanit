import { describe, expect, it } from 'vitest'
import { clientNameTokens, decideClient, namesCompatible, pickClientMatch, type MatchCandidate } from './client-match'

const c = (id: string, name: string, created_at: string, is_active: boolean | null = true): MatchCandidate => ({
  id, name, created_at, is_active,
})

describe('clientNameTokens', () => {
  it('ignores accents, case, punctuation, initials and particles', () => {
    expect(clientNameTokens('  María-José de la CRUZ  ')).toEqual(['maria', 'jose', 'cruz'])
    expect(clientNameTokens('J. Pérez')).toEqual(['perez'])
    expect(clientNameTokens(null)).toEqual([])
  })
})

describe('namesCompatible: the same person', () => {
  const same: [string, string][] = [
    ['Juan Perez', 'juan perez'],
    ['Juan Pérez', 'Juan Perez'],
    ['Juan Perez', 'Juan Carlos Perez Garcia'],
    ['Juan Perez', 'Perez Juan'], // surname first
    ['Ana María Lopez', 'Maria Lopez'], // second given name used
    ['Alex Torres', 'Alexander Torres'], // shortened name
    ['Juan', 'Juan Perez'], // only the first name typed
    ['Juan Perez', ''], // nothing to contradict
    ['', 'Juan Perez'],
  ]
  it.each(same)('%s ~ %s', (a, b) => expect(namesCompatible(a, b)).toBe(true))
})

describe('namesCompatible: clearly different people', () => {
  const different: [string, string][] = [
    ['Juan Perez', 'Maria Lopez'],
    ['Maria Lopez', 'Pedro Lopez'], // same surname = a family on one phone
    ['Juan Perez', 'Pedro Perez'],
    ['Carlos Ramos', 'Luis Quispe'],
  ]
  it.each(different)('%s != %s', (a, b) => expect(namesCompatible(a, b)).toBe(false))

  it('a shortened name needs 3+ letters (no "Al" matching everything)', () => {
    expect(namesCompatible('Al Torres', 'Alberto Diaz')).toBe(false)
  })
})

describe('pickClientMatch', () => {
  it('is deterministic: the oldest active compatible client', () => {
    const list = [
      c('b', 'Juan Perez', '2026-03-01'),
      c('a', 'Juan Perez', '2026-01-01'),
      c('z', 'Juan Perez', '2025-01-01', false), // inactive: only if no active one
    ]
    expect(pickClientMatch(list, 'Juan Perez')?.id).toBe('a')
    expect(pickClientMatch([...list].reverse(), 'Juan Perez')?.id).toBe('a')
  })

  it('falls back to an inactive client when it is the only one', () => {
    expect(pickClientMatch([c('z', 'Juan Perez', '2025-01-01', false)], 'Juan')?.id).toBe('z')
  })

  it('breaks a tie on the same date by id', () => {
    const list = [c('b', 'Juan Perez', '2026-01-01'), c('a', 'Juan Perez', '2026-01-01')]
    expect(pickClientMatch(list, 'Juan Perez')?.id).toBe('a')
  })

  it('returns null when nobody is compatible', () => {
    expect(pickClientMatch([c('a', 'Maria Lopez', '2026-01-01')], 'Juan Perez')).toBeNull()
  })
})

describe('decideClient', () => {
  const juan = c('juan', 'Juan Perez', '2026-01-01')
  const maria = c('maria', 'Maria Lopez', '2026-02-01')

  it('attaches to the client when the contact matches and the name fits', () => {
    expect(decideClient('Juan Perez', { phone: [juan] })).toEqual({ clientId: 'juan', reason: 'phone', skipDocument: false })
  })

  it('document beats email beats phone', () => {
    const out = decideClient('Juan Perez', { document: [juan], email: [maria], phone: [maria] })
    expect(out.clientId).toBe('juan')
    expect(out.reason).toBe('document')
  })

  it('keeps people apart on a shared phone: a new client, flagged', () => {
    expect(decideClient('Pedro Lopez', { phone: [maria] })).toEqual({
      clientId: null, reason: 'new:name_mismatch', skipDocument: false,
    })
  })

  it('David\'s case: same email, other phone, same name -> the existing Juan Perez', () => {
    expect(decideClient('Juan Perez', { email: [juan] }).clientId).toBe('juan')
  })

  it('same email but another Juan Perez with a different email stays separate only if the name differs', () => {
    expect(decideClient('Juan Perez', { email: [juan], phone: [maria] }).clientId).toBe('juan')
  })

  it('falls through a rejected email to a compatible phone', () => {
    expect(decideClient('Juan Perez', { email: [maria], phone: [juan] })).toEqual({
      clientId: 'juan', reason: 'phone', skipDocument: false,
    })
  })

  it('a document whose owner has another name does not get copied to the new client', () => {
    expect(decideClient('Pedro Lopez', { document: [juan] })).toEqual({
      clientId: null, reason: 'new:name_mismatch', skipDocument: true,
    })
  })

  it('a brand new person is simply new', () => {
    expect(decideClient('Pedro Lopez', {})).toEqual({ clientId: null, reason: 'new', skipDocument: false })
  })
})
