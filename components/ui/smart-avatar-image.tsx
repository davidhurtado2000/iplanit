'use client'

import type { ComponentProps } from 'react'
import { AvatarImage } from '@/components/ui/avatar'
import { backdropClass, useImageBackdrop } from '@/lib/image-backdrop'
import { cn } from '@/lib/utils'

// Drop-in AvatarImage for user-uploaded logos/avatars: adds a contrasting
// background behind transparent pixels when the visible part of the image
// is all-light (or all-dark in dark mode) - see lib/image-backdrop.ts.
export function SmartAvatarImage({ src, className, ...props }: ComponentProps<typeof AvatarImage>) {
  const backdrop = useImageBackdrop(typeof src === 'string' ? src : undefined)
  // Loading the visible image in CORS mode too keeps the browser cache
  // entry usable by the pixel analysis (see lib/image-backdrop.ts).
  return (
    <AvatarImage src={src} crossOrigin="anonymous" className={cn(backdropClass(backdrop), className)} {...props} />
  )
}
