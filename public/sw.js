// iPlanit service worker: ONLY for phone notifications (Web Push).
// It deliberately has no fetch handler and caches nothing, so it can never
// serve a stale copy of the app after a deploy.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  // Browsers (iPhone especially) require a visible notification for every push.
  event.waitUntil(
    self.registration.showNotification(data.title || 'iPlanit', {
      body: data.body || '',
      icon: '/web-app-manifest-192x192.png',
      badge: '/notification-badge.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/dashboard/calendar' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/dashboard', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url).catch(() => {})
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
