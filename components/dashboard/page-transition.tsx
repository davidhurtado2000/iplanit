'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

// Keyed on pathname so switching sidebar sections replays the fade-in -
// makes dashboard navigation feel like moving between screens in an app
// instead of a flat content swap. Kept to 180ms (vs the 700ms landing-page
// Reveal) since this fires on every nav click, not once per visitor.
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  return (
    <div key={pathname} className="animate-page-fade-in">
      {children}
    </div>
  )
}
