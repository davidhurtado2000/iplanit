'use client'

import { useEffect, useState } from 'react'

// A logo with a transparent background and white lettering is invisible on
// a light surface (and a black-on-transparent one on a dark surface).
// Sampling the image once tells us what it needs behind it, so nobody has
// to configure a "logo background" setting. Opaque images (photos, logos
// with their own background) get nothing - they already look as intended.
export type ImageBackdrop = 'dark' | 'light' | null

const cache = new Map<string, Promise<ImageBackdrop>>()

// A browser that already cached this image from a plain (non-CORS) <img>
// can serve that copy to the CORS request below, and reading its pixels
// then fails - leaving the logo invisible for exactly the returning
// visitors. One retry with a cache-busting param sidesteps that copy.
async function analyze(url: string): Promise<ImageBackdrop> {
  const first = await analyzeOnce(url)
  if (first !== 'error') return first
  const retry = await analyzeOnce(`${url}${url.includes('?') ? '&' : '?'}_bd=1`)
  return retry === 'error' ? null : retry
}

function analyzeOnce(url: string): Promise<ImageBackdrop | 'error'> {
  return new Promise((resolve) => {
    const img = new Image()
    // Storage serves Access-Control-Allow-Origin: *, which is what lets the
    // canvas below read pixels instead of throwing a tainted-canvas error.
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const size = 32
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)
        let transparent = 0
        let opaque = 0
        let luminanceSum = 0
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) {
            transparent++
            continue
          }
          opaque++
          luminanceSum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
        }
        const total = transparent + opaque
        if (opaque === 0 || transparent / total < 0.15) return resolve(null)
        const luminance = luminanceSum / opaque
        resolve(luminance > 0.72 ? 'dark' : luminance < 0.28 ? 'light' : null)
      } catch {
        // Tainted canvas - the cached-without-CORS case above.
        resolve('error')
      }
    }
    img.onerror = () => resolve('error')
    img.src = url
  })
}

export function useImageBackdrop(url: string | null | undefined): ImageBackdrop {
  const [backdrop, setBackdrop] = useState<ImageBackdrop>(null)
  useEffect(() => {
    if (!url) {
      setBackdrop(null)
      return
    }
    let cancelled = false
    if (!cache.has(url)) cache.set(url, analyze(url))
    cache.get(url)!.then((value) => {
      if (!cancelled) setBackdrop(value)
    })
    return () => {
      cancelled = true
    }
  }, [url])
  return backdrop
}

/** Tailwind classes for an <img>'s own background - shows through only the
 * transparent pixels. 'light' only matters in dark mode (a dark logo on a
 * light page is already fine). */
export function backdropClass(backdrop: ImageBackdrop) {
  if (backdrop === 'dark') return 'bg-neutral-900'
  if (backdrop === 'light') return 'dark:bg-white'
  return ''
}
