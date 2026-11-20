'use client'

import { useCallback, useEffect, useState } from 'react'

// Browser side of the phone notices (Web Push): checks what this device can
// do, asks for permission, registers /sw.js and saves the subscription.

export type PushState =
  | 'loading'
  | 'off' // can be turned on
  | 'on' // turned on in this browser
  | 'denied' // the user blocked notices for this site
  | 'ios-install' // iPhone/iPad: only works once the app is on the home screen
  | 'unsupported'
  | 'not-configured' // no VAPID key on this deployment

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export type PushPlatform = 'ios' | 'android' | 'desktop'

/** Which kind of device this is, to show the tips that apply to it. Browser only. */
export function detectPlatform(): PushPlatform {
  if (typeof navigator === 'undefined') return 'desktop'
  if (isIos()) return 'ios'
  return /Android/i.test(navigator.userAgent) ? 'android' : 'desktop'
}

function isIos(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1)
}

function isInstalledApp(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function canPush(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  return reg ? reg.pushManager.getSubscription() : null
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>('loading')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!PUBLIC_KEY) return setState('not-configured')
    if (!canPush()) return setState(isIos() && !isInstalledApp() ? 'ios-install' : 'unsupported')
    if (Notification.permission === 'denied') return setState('denied')
    try {
      const sub = await currentSubscription()
      setState(sub && Notification.permission === 'granted' ? 'on' : 'off')
    } catch {
      setState('off')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /** Must run from a tap/click: browsers only show the permission prompt then. */
  const enable = useCallback(async (): Promise<'ok' | 'denied' | 'error'> => {
    if (!PUBLIC_KEY) return 'error'
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off')
        return 'denied'
      }
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY),
        }))
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      if (!res.ok) throw new Error(`subscribe ${res.status}`)
      setState('on')
      return 'ok'
    } catch (err) {
      console.error('[iplanit] enabling push failed:', err)
      await refresh()
      return 'error'
    } finally {
      setBusy(false)
    }
  }, [refresh])

  const disable = useCallback(async () => {
    setBusy(true)
    try {
      const sub = await currentSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {})
        await sub.unsubscribe()
      }
      setState('off')
    } finally {
      setBusy(false)
    }
  }, [])

  return { state, busy, enable, disable }
}
