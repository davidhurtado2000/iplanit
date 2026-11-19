import { describe, expect, it } from 'vitest'
import { isAllowedPushEndpoint } from './endpoint'

describe('isAllowedPushEndpoint', () => {
  it('accepts the real browser push services', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true)
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true)
    expect(isAllowedPushEndpoint('https://web.push.apple.com/abc')).toBe(true)
    expect(isAllowedPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=abc')).toBe(true)
  })

  it('rejects any other address (the server would be calling it)', () => {
    expect(isAllowedPushEndpoint('https://evil.example.com/push')).toBe(false)
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com.evil.com/x')).toBe(false)
    expect(isAllowedPushEndpoint('https://evilfcm.googleapis.com.attacker.io/x')).toBe(false)
    expect(isAllowedPushEndpoint('https://169.254.169.254/latest/meta-data')).toBe(false)
  })

  it('rejects non-https, credentials, ports and junk', () => {
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/x')).toBe(false)
    expect(isAllowedPushEndpoint('https://user:pw@fcm.googleapis.com/x')).toBe(false)
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false)
    expect(isAllowedPushEndpoint('not a url')).toBe(false)
    expect(isAllowedPushEndpoint(42)).toBe(false)
  })
})
