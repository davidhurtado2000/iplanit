'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Toaster as Sonner, ToasterProps } from 'sonner'

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme()
  // useTheme() resolves to the real theme only after mount (it's
  // 'system'/undefined on the server, since the actual preference lives in
  // localStorage/matchMedia, neither available during SSR). Rendering Sonner
  // before that resolves risks a hydration mismatch on whatever DOM Sonner
  // varies by theme - matches the same mounted-gating already used for the
  // theme <Select> in Settings.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      closeButton
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
