'use client'

// Realtime events don't say who made a change, so this tab remembers when IT
// just wrote a reservation: events arriving right after count as "mine" and
// play no sound (the person already knows what they did). A teammate's
// change from another device still sounds. Inserts don't need this - their
// sold_by already says who created them.
const OWN_WRITE_WINDOW_MS = 5000
let lastOwnWriteAt = 0

/** Call right BEFORE writing a reservation (the event can arrive mid-await). */
export function markOwnReservationWrite(): void {
  lastOwnWriteAt = Date.now()
}

export function isRecentOwnWrite(): boolean {
  return Date.now() - lastOwnWriteAt < OWN_WRITE_WINDOW_MS
}
