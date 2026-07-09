'use client'

import { useEffect, useState } from 'react'

const COLORS = ['#f43f5e', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899']

interface Piece {
  id: number
  left: number
  color: string
  delay: number
  duration: number
  rotation: number
}

export function Confetti({ pieceCount = 80 }: { pieceCount?: number }) {
  const [pieces, setPieces] = useState<Piece[]>([])

  // Generated client-side on mount so server/client markup matches (Math.random
  // during render would mismatch during hydration).
  useEffect(() => {
    setPieces(
      Array.from({ length: pieceCount }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        color: COLORS[i % COLORS.length],
        delay: Math.random() * 0.4,
        duration: 2.2 + Math.random() * 1.3,
        rotation: Math.random() * 360,
      }))
    )
  }, [pieceCount])

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-[-10px] h-2.5 w-1.5 rounded-sm"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            transform: `rotate(${p.rotation}deg)`,
            animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  )
}
