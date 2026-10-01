import React from 'react'
import type { Metadata } from 'next'
import { Geist, Geist_Mono, Sora } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { AuthProvider } from '@/context/auth-context'
import { LanguageProvider } from '@/context/language-context'
import { ThemeProvider } from '@/components/theme-provider'
import { GoogleAnalytics } from '@/components/google-analytics'
import './globals.css'

const geistSans = Geist({ 
  subsets: ['latin'],
  variable: '--font-geist-sans',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

// Display face, used only by the public booking flow (app/reservar) for
// business names, step titles, and the confirmation ticket's date/time -
// loaded globally here (next/font requires this) but never applied outside
// components that opt into the `font-display` utility, so it has zero
// visual effect on the dashboard or the marketing site. Was Fraunces (a
// serif) - replaced 2026-09-30 after David compared options live and
// picked this warmer sans over both the serif and plain Geist-everywhere,
// see the "Booking Page Fonts" artifact from that session.
const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
})

export const metadata: Metadata = {
  // www is the actual canonical host (apex redirects here) - metadataBase
  // resolves every relative canonical/OG URL Next.js generates, so pointing
  // it at the apex domain made every page's own canonical tag point at a
  // URL that itself redirects, confusing Google about which one to index.
  metadataBase: new URL('https://www.iplanit.io'),
  title: 'iPlanit - Booking and Scheduling Management',
  description:
    'SaaS platform for managing bookings, appointments, and schedules for service businesses',
  generator: 'v0.app',
  openGraph: {
    type: 'website',
    siteName: 'iPlanit',
    title: 'iPlanit - Booking and Scheduling Management',
    description:
      'SaaS platform for managing bookings, appointments, and schedules for service businesses',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'iPlanit - Booking and Scheduling Management',
    description:
      'SaaS platform for managing bookings, appointments, and schedules for service businesses',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} ${sora.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AuthProvider>
            <LanguageProvider>
              {children}
              {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
                <GoogleAnalytics measurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
              )}
            </LanguageProvider>
          </AuthProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
