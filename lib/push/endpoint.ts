// A push subscription's "endpoint" is a URL the SERVER will POST to. Anyone
// signed in can register one, so it must be limited to the real browser push
// services: otherwise an account could make our server call any address.

const PUSH_HOST_SUFFIXES = [
  'fcm.googleapis.com', // Chrome, Edge, Opera, Samsung, Android
  'android.googleapis.com',
  'push.services.mozilla.com', // Firefox
  'push.apple.com', // Safari / iPhone (web.push.apple.com)
  'notify.windows.com', // Edge/Windows (wns*.notify.windows.com)
]

export function isAllowedPushEndpoint(endpoint: unknown): boolean {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
  const host = url.hostname.toLowerCase()
  return PUSH_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
}
