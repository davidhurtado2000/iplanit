import type { CSSProperties } from 'react'
import { Sora, Playfair_Display, Oswald, Bebas_Neue, Montserrat, Lora, Abril_Fatface, Nunito } from 'next/font/google'

// Curated display fonts for a business's public booking link
// (scripts/103-booking-branding.sql - keys must match its check constraint).
// Self-hosted by next/font, so visitors never hit Google directly, and
// preload: false means a browser only downloads the one font a page
// actually renders - importing all eight costs nothing for the other seven.
const sora = Sora({ subsets: ['latin'], display: 'swap', preload: false })
const playfair = Playfair_Display({ subsets: ['latin'], display: 'swap', preload: false })
const oswald = Oswald({ subsets: ['latin'], display: 'swap', preload: false })
const bebas = Bebas_Neue({ subsets: ['latin'], weight: '400', display: 'swap', preload: false })
const montserrat = Montserrat({ subsets: ['latin'], display: 'swap', preload: false })
const lora = Lora({ subsets: ['latin'], display: 'swap', preload: false })
const abril = Abril_Fatface({ subsets: ['latin'], weight: '400', display: 'swap', preload: false })
const nunito = Nunito({ subsets: ['latin'], display: 'swap', preload: false })

export type BookingFontKey = 'sora' | 'playfair' | 'oswald' | 'bebas' | 'montserrat' | 'lora' | 'abril' | 'nunito'

export const BOOKING_FONTS: { key: BookingFontKey; fontFamily: string }[] = [
  { key: 'sora', fontFamily: sora.style.fontFamily },
  { key: 'playfair', fontFamily: playfair.style.fontFamily },
  { key: 'oswald', fontFamily: oswald.style.fontFamily },
  { key: 'bebas', fontFamily: bebas.style.fontFamily },
  { key: 'montserrat', fontFamily: montserrat.style.fontFamily },
  { key: 'lora', fontFamily: lora.style.fontFamily },
  { key: 'abril', fontFamily: abril.style.fontFamily },
  { key: 'nunito', fontFamily: nunito.style.fontFamily },
]

export const BOOKING_ACCENT_SWATCHES = [
  '#1f2a44', // default navy (matches the stock booking palette)
  '#111111',
  '#8b1e2d',
  '#b45309',
  '#0f766e',
  '#1d4ed8',
  '#6d28d9',
  '#be185d',
]

function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function accentForeground(hex: string) {
  return relativeLuminance(hex) > 0.45 ? '#111827' : '#ffffff'
}

export function fontFamilyFor(key: string | null | undefined) {
  return (BOOKING_FONTS.find((f) => f.key === key) ?? BOOKING_FONTS[0]).fontFamily
}

/**
 * CSS custom-property overrides for a .booking-shell element. --font-sora is
 * what the inlined `font-display` utility actually reads (globals.css'
 * @theme inline), so overriding it here re-fonts every heading on the page
 * without touching markup. --primary/--ring re-color every shadcn primitive,
 * with the text-on-accent color picked by contrast so a light brand color
 * still gets readable button labels.
 */
export const BOOKING_BG_SWATCHES = [
  '#0a0a0a', // near-black (most barbershop sites)
  '#111827', // charcoal blue
  '#1c1917', // dark brown
  '#ffffff',
  '#f5f5f4', // warm off-white
  '#f8fafc', // cool off-white
]

const isHex = (v: string | null | undefined): v is string => !!v && /^#[0-9a-fA-F]{6}$/.test(v)

/** Light or dark text for a chosen page background; undefined = no custom
 * background, so the page keeps following the visitor's own theme. */
export function bookingThemeMode(bg: string | null | undefined): 'light' | 'dark' | undefined {
  if (!isHex(bg)) return undefined
  return relativeLuminance(bg) > 0.4 ? 'light' : 'dark'
}

/** Text color on a custom page background - also used by Settings' preview. */
export function bookingForegroundFor(bg: string) {
  return bookingThemeMode(bg) === 'dark' ? '#f3f4f6' : '#1f2937'
}

export function bookingBrandStyle(
  font: string | null | undefined,
  accent: string | null | undefined,
  bg?: string | null
): CSSProperties {
  const style: Record<string, string> = {}
  // Every surface is derived from the one chosen color, so cards, borders
  // and secondary text always keep enough contrast against it.
  if (isHex(bg)) {
    const dark = bookingThemeMode(bg) === 'dark'
    const fg = bookingForegroundFor(bg)
    const card = dark ? `color-mix(in oklab, ${bg} 92%, #ffffff)` : `color-mix(in oklab, ${bg} 35%, #ffffff)`
    style['--background'] = bg
    style['--foreground'] = fg
    style['--card'] = card
    style['--card-foreground'] = fg
    style['--popover'] = card
    style['--popover-foreground'] = fg
    style['--muted'] = `color-mix(in oklab, ${bg} 88%, ${fg})`
    style['--muted-foreground'] = `color-mix(in oklab, ${fg} 62%, ${bg})`
    style['--border'] = `color-mix(in oklab, ${bg} 80%, ${fg})`
    style['--input'] = `color-mix(in oklab, ${bg} 80%, ${fg})`
    style['--accent'] = `color-mix(in oklab, ${bg} 85%, ${fg})`
    style['--accent-foreground'] = fg
    style.colorScheme = dark ? 'dark' : 'light'
  }
  const chosenFont = BOOKING_FONTS.find((f) => f.key === font)
  if (chosenFont) style['--font-sora'] = chosenFont.fontFamily
  if (accent && /^#[0-9a-fA-F]{6}$/.test(accent)) {
    style['--primary'] = accent
    style['--ring'] = accent
    style['--primary-foreground'] = accentForeground(accent)
  }
  return style as CSSProperties
}
