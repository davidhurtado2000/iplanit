import type { ReactNode } from 'react'

/** Groups related fields under a labeled heading, so a long form reads as
 * distinct sections instead of one flat stack (first used to break up the
 * Services create/edit modal, now shared with Settings' Profile/Business
 * tabs - same problem, same fix). */
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  )
}
