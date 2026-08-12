import { ImageResponse } from 'next/og'

// Static English copy matching app/layout.tsx's metadata (the true site
// default) rather than trying to reflect the visitor's language - social
// crawlers fetch this once, server-side, with no access to the client-side
// language context. Colors are the primary/accent tokens from
// app/globals.css converted from oklch to hex, since Satori (which
// next/og uses to render this) doesn't support the oklch() function.
export const alt = 'iPlanit - Booking and Scheduling Management'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          backgroundColor: '#02060d',
          backgroundImage:
            'radial-gradient(circle at 82% 15%, rgba(0,114,213,0.38), transparent 55%), radial-gradient(circle at 12% 88%, rgba(0,187,135,0.3), transparent 50%)',
          padding: '90px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              display: 'flex',
              width: 68,
              height: 68,
              borderRadius: 18,
              backgroundColor: '#0072d5',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 34,
              fontWeight: 700,
              color: '#ffffff',
            }}
          >
            iP
          </div>
          <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, color: '#ffffff' }}>iPlanit</div>
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 52,
            fontSize: 58,
            fontWeight: 700,
            color: '#ffffff',
            lineHeight: 1.15,
            maxWidth: 900,
          }}
        >
          The booking system for service businesses
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 26,
            fontSize: 28,
            color: '#9db4c7',
            maxWidth: 780,
          }}
        >
          Calendar, clients, and team - plus a booking link your clients use themselves.
        </div>
      </div>
    ),
    { ...size }
  )
}
