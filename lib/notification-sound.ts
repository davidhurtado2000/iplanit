'use client'

/**
 * Short two-note chime generated with the Web Audio API instead of shipping
 * an audio file - avoids managing/licensing a binary asset for one small
 * sound. Silently no-ops if the browser blocks/lacks AudioContext (e.g. no
 * user interaction yet on some browsers) - the toast itself still shows.
 */
export function playNotificationChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioContextClass()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, ctx.currentTime)
    oscillator.frequency.setValueAtTime(1046.5, ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start()
    oscillator.stop(ctx.currentTime + 0.35)
  } catch {
    // Ignored - see comment above.
  }
}
