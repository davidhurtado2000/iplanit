import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
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

// Needs Node's fs to read the real logo files out of /public below -
// Satori/ImageResponse can't fetch relative "/foo.png" URLs at render time,
// only absolute URLs or data: URIs. Everything centered (not corner-pinned)
// on purpose: chat apps like WhatsApp crop this 1200x630 image down to a
// small, unpredictable region for the compact link-preview thumbnail (see
// the screenshot that prompted this - the old corner logo was cropped out
// entirely, leaving only a stray line of body text). A centered lockup
// survives that crop regardless of which region gets kept.
export default async function Image() {
  const [isotipo, wordmark] = await Promise.all([
    readFile(join(process.cwd(), 'public', 'favicon-96x96-white.png')),
    readFile(join(process.cwd(), 'public', 'logotipo_mododark.png')),
  ])
  const isotipoSrc = `data:image/png;base64,${isotipo.toString('base64')}`
  const wordmarkSrc = `data:image/png;base64,${wordmark.toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#02060d',
          backgroundImage:
            'radial-gradient(circle at 50% 0%, rgba(0,114,213,0.4), transparent 55%), radial-gradient(circle at 50% 100%, rgba(0,187,135,0.28), transparent 55%)',
          padding: '90px',
        }}
      >
        <img src={isotipoSrc} width={112} height={112} alt="" />
        {/* logotipo_mododark.png is 2349x806 (2.914:1) - height fixed, width
            derived from that ratio so the wordmark never looks stretched. */}
        <img src={wordmarkSrc} width={Math.round(64 * 2.914)} height={64} alt="" style={{ marginTop: 28 }} />

        <div
          style={{
            display: 'flex',
            marginTop: 44,
            fontSize: 52,
            fontWeight: 700,
            color: '#ffffff',
            textAlign: 'center',
          }}
        >
          Fewer calls. More bookings.
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 22,
            fontSize: 26,
            color: '#9db4c7',
            textAlign: 'center',
            maxWidth: 760,
          }}
        >
          The booking system for service businesses
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 40,
            fontSize: 22,
            fontWeight: 600,
            color: '#5ea8e0',
            letterSpacing: 1,
          }}
        >
          iplanit.io
        </div>
      </div>
    ),
    { ...size }
  )
}
