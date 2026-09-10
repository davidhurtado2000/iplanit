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

/**
 * A descending two-note tone (opposite direction of playNotificationChime's
 * rising one) for a cancellation that wasn't a routine "client/staff
 * cancelled in iPlanit" action - specifically a Kommo lead marked Lost.
 * Lower-pitched and falling reads as "something fell through" without
 * being harsh/alarming, distinct enough at a glance (well, an ear) from
 * both the routine chime and playSuccessChime below.
 */
export function playLostDealChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioContextClass()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(659.25, ctx.currentTime)
    oscillator.frequency.setValueAtTime(440, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45)
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start()
    oscillator.stop(ctx.currentTime + 0.45)
  } catch {
    // Ignored - see playNotificationChime's own comment above.
  }
}

/**
 * A brighter, three-note ascending chime (C5-E5-G5, a major triad) for the
 * "welcome to Pro/Premium" moment after a successful subscription - reuses
 * the same no-asset Web Audio approach as playNotificationChime, but longer
 * and more festive since this is a one-off celebration, not a routine
 * booking alert.
 */
export function playSuccessChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioContextClass()
    const notes = [523.25, 659.25, 783.99]
    notes.forEach((freq, i) => {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      const startTime = ctx.currentTime + i * 0.1
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(freq, startTime)
      gain.gain.setValueAtTime(0.15, startTime)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4)
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start(startTime)
      oscillator.stop(startTime + 0.4)
    })
  } catch {
    // Ignored - see comment above.
  }
}
