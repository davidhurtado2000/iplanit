'use client'

import { useEffect } from 'react'

/**
 * Catches an error thrown by the ROOT layout itself (app/layout.tsx) -
 * much rarer than what app/error.tsx handles (which covers everything
 * below the root layout, including every page). Next.js requires this file
 * to render its own <html>/<body> since it replaces the root layout
 * entirely when it fires, which also means none of the context providers
 * normally wrapping the app (LanguageProvider included) are available here
 * - kept deliberately minimal and self-contained rather than reaching for
 * app UI/i18n that may not be mounted.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[iplanit] Uncaught root layout error:', error)
  }, [error])

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          padding: '16px',
          textAlign: 'center',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          backgroundColor: '#ffffff',
          color: '#111827',
        }}
      >
        <h1 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Algo salió mal / Something went wrong</h1>
        <p style={{ fontSize: '14px', color: '#6b7280', maxWidth: '320px', margin: 0 }}>
          Ocurrió un error inesperado. Intenta recargar la página.
          <br />
          An unexpected error occurred. Please try reloading the page.
        </p>
        <button
          onClick={() => reset()}
          style={{
            marginTop: '8px',
            padding: '10px 18px',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            fontSize: '14px',
            fontWeight: 500,
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Reintentar / Try again
        </button>
      </body>
    </html>
  )
}
