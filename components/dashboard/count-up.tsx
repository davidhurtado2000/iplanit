'use client'

import { useEffect, useRef, useState } from 'react'

// Animates from 0 (or the previous value) up to `value` instead of the
// number just appearing - used inside HeroKpiCard's headline numbers
// (Dashboard, Analytics, Clients, Parking). Renders 0 on first paint so the
// server-rendered and pre-hydration client markup match (no hydration
// mismatch warning), then counts up once mounted. Skips straight to the
// final value under prefers-reduced-motion.
export function CountUp({
  value,
  duration = 700,
  decimals = 0,
  prefix = '',
  suffix = '',
}: {
  value: number
  duration?: number
  decimals?: number
  prefix?: string
  suffix?: string
}) {
  const [display, setDisplay] = useState(0)
  const prevValue = useRef(0)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      prevValue.current = value
      setDisplay(value)
      return
    }
    const from = prevValue.current
    const to = value
    if (from === to) return

    const start = performance.now()
    let frame: number
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(from + (to - from) * eased)
      if (progress < 1) {
        frame = requestAnimationFrame(tick)
      } else {
        prevValue.current = to
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  return (
    <>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </>
  )
}
