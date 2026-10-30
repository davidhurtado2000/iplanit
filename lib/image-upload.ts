'use client'

import { useCallback, useRef } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

// A phone photo straight off the camera is routinely 3-8MB at 3000px+.
// Downscaling and re-encoding as JPEG typically lands under ~300KB, which is
// what matters for storage cost and how fast the public booking page loads.
// createImageBitmap + canvas needs no dependency.
export async function resizeImageFile(file: File, maxDimension = 1200, quality = 0.82): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) return file

    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch (err) {
    console.error('[iplanit] Error resizing image, uploading original:', err)
    return file
  }
}

export function storagePathFromPublicUrl(bucket: string, url: string): string | null {
  const marker = `/${bucket}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return url.slice(idx + marker.length).split('?')[0]
}

// Best-effort: a leftover file is a storage-clutter problem, not a
// correctness one, so a failed delete only logs.
export async function deleteStorageImage(supabase: SupabaseClient, bucket: string, url: string) {
  const path = storagePathFromPublicUrl(bucket, url)
  if (!path) return
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) console.error(`[iplanit] Error deleting ${bucket} file:`, error)
}

/**
 * Defers storage deletes until the form is actually saved. Deleting the old
 * file the moment a new one is picked (or "Quitar" is clicked) breaks the
 * saved record if the user then cancels - it still points at the file that
 * was just removed. Instead: begin() when the form opens, track() each
 * upload, then commit(savedUrl) on a successful save (drops the original if
 * it was replaced, plus any intermediate uploads) or discard() on close
 * without saving (drops only this session's unsaved uploads).
 */
export function useStagedImage(supabase: SupabaseClient, bucket: string) {
  const originalRef = useRef<string | null>(null)
  const uploadedRef = useRef<Set<string>>(new Set())

  const begin = useCallback((original: string | null) => {
    originalRef.current = original
    uploadedRef.current = new Set()
  }, [])

  const track = useCallback((url: string) => {
    uploadedRef.current.add(url)
  }, [])

  const commit = useCallback(
    async (savedUrl: string | null) => {
      const stale = [...uploadedRef.current]
      if (originalRef.current) stale.push(originalRef.current)
      originalRef.current = savedUrl
      uploadedRef.current = new Set()
      await Promise.all(stale.filter((url) => url !== savedUrl).map((url) => deleteStorageImage(supabase, bucket, url)))
    },
    [supabase, bucket]
  )

  const discard = useCallback(async () => {
    const unsaved = [...uploadedRef.current]
    uploadedRef.current = new Set()
    await Promise.all(unsaved.map((url) => deleteStorageImage(supabase, bucket, url)))
  }, [supabase, bucket])

  return { begin, track, commit, discard }
}
