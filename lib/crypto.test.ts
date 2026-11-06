import { beforeAll, describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret } from './crypto'
import { decryptToken, encryptToken } from './kommo/encryption'

const KEY_A = 'a'.repeat(64)
const KEY_B = 'b'.repeat(64)

beforeAll(() => {
  process.env.TEST_KEY_A = KEY_A
  process.env.TEST_KEY_B = KEY_B
  process.env.KOMMO_TOKEN_ENCRYPTION_KEY = KEY_A
})

describe('secret encryption', () => {
  it('round-trips a value', () => {
    const stored = encryptSecret('token-123', 'TEST_KEY_A')
    expect(stored).not.toContain('token-123')
    expect(decryptSecret(stored, 'TEST_KEY_A')).toBe('token-123')
  })

  it('fails with a different key', () => {
    const stored = encryptSecret('token-123', 'TEST_KEY_A')
    expect(() => decryptSecret(stored, 'TEST_KEY_B')).toThrow()
  })

  it('detects tampering', () => {
    const [iv, tag, data] = encryptSecret('token-123', 'TEST_KEY_A').split(':')
    const flipped = (data[0] === '0' ? '1' : '0') + data.slice(1)
    expect(() => decryptSecret(`${iv}:${tag}:${flipped}`, 'TEST_KEY_A')).toThrow()
  })

  it('keeps Kommo tokens compatible with the shared helper', () => {
    const stored = encryptToken('kommo-token')
    expect(decryptToken(stored)).toBe('kommo-token')
    expect(decryptSecret(stored, 'KOMMO_TOKEN_ENCRYPTION_KEY')).toBe('kommo-token')
  })
})
