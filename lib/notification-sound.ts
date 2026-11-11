'use client'

/**
 * Short chimes generated with the Web Audio API instead of shipping audio
 * files - avoids managing/licensing binary assets for a few small sounds.
 * Every one silently no-ops if the browser blocks/lacks AudioContext (e.g.
 * no user interaction yet on some browsers) - the toast itself still shows.
 *
 * Which sound plays when (context/dashboard-data-context.tsx):
 * - playPublicBookingChime: a client booked on their own from the public page
 * - playNotificationChime: a teammate confirmed/completed/created something
 * - playCancelChime: a cancellation or no-show made by someone else
 * - playLostDealChime: a Kommo lead marked Lost cancelled a reservation
 * - playSuccessChime: subscribing to a plan
 * Your own actions in this tab play nothing (lib/own-actions.ts).
 */

// Per device, not per account: the front-desk computer can be muted while
// the owner's phone still chimes. Settings > Notificaciones.
const SOUND_KEY = 'iplanit-sounds-enabled'

export function isSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== 'false'
  } catch {
    return true
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, enabled ? 'true' : 'false')
  } catch {
    // Private mode / blocked storage: the switch just won't persist.
  }
}

type Note = { freq: number; at: number; length: number }

function play(notes: Note[], volume = 0.15) {
  if (!isSoundEnabled()) return
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioContextClass()
    for (const note of notes) {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      const start = ctx.currentTime + note.at
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(note.freq, start)
      gain.gain.setValueAtTime(volume, start)
      gain.gain.exponentialRampToValueAtTime(0.001, start + note.length)
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start(start)
      oscillator.stop(start + note.length)
    }
  } catch {
    // Ignored - see comment above.
  }
}

/** Routine two-note rising chime (A5 -> C6). */
export function playNotificationChime() {
  play([
    { freq: 880, at: 0, length: 0.12 },
    { freq: 1046.5, at: 0.1, length: 0.25 },
  ])
}

/**
 * The best news of the day: a client booked on their own. Brighter and a
 * note longer than the routine chime (C6 -> E6 -> G6), so it's recognizable
 * without looking.
 */
export function playPublicBookingChime() {
  play([
    { freq: 1046.5, at: 0, length: 0.2 },
    { freq: 1318.5, at: 0.09, length: 0.22 },
    { freq: 1568, at: 0.18, length: 0.35 },
  ])
}

/** Soft falling two-note tone for a cancellation or no-show (D5 -> B4). */
export function playCancelChime() {
  play(
    [
      { freq: 587.3, at: 0, length: 0.14 },
      { freq: 493.9, at: 0.12, length: 0.3 },
    ],
    0.12
  )
}

/**
 * Lower descending tone for a Kommo lead marked Lost (E5 -> A4): "something
 * fell through", distinct from a routine cancellation.
 */
export function playLostDealChime() {
  play([
    { freq: 659.25, at: 0, length: 0.17 },
    { freq: 440, at: 0.15, length: 0.3 },
  ])
}

/** Celebratory major triad (C5-E5-G5) after subscribing to Pro/Premium. */
export function playSuccessChime() {
  play(
    [523.25, 659.25, 783.99].map((freq, i) => ({ freq, at: i * 0.1, length: 0.4 }))
  )
}
