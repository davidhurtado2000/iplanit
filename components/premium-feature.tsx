'use client'

import React from "react"

import { useState } from 'react'
import { Crown, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { UpgradeModal } from '@/components/upgrade-modal'
import { currentUser } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

interface PremiumFeatureProps {
  children: React.ReactNode
  featureName: string
  className?: string
  showOverlay?: boolean
}

export function PremiumFeature({
  children,
  featureName,
  className,
  showOverlay = true,
}: PremiumFeatureProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const isPremium = currentUser.plan === 'premium'

  if (isPremium) {
    return <>{children}</>
  }

  return (
    <>
      <div className={cn('relative', className)}>
        {showOverlay && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 p-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-400/20 to-orange-500/20">
                <Crown className="h-6 w-6 text-amber-500" />
              </div>
              <div>
                <p className="font-medium text-foreground">Funcion Premium</p>
                <p className="text-sm text-muted-foreground">{featureName}</p>
              </div>
              <Button
                size="sm"
                className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600"
                onClick={() => setShowUpgradeModal(true)}
              >
                <Crown className="h-4 w-4" />
                Desbloquear
              </Button>
            </div>
          </div>
        )}
        <div className={showOverlay ? 'pointer-events-none select-none opacity-50 blur-[2px]' : ''}>
          {children}
        </div>
      </div>
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        feature={featureName}
      />
    </>
  )
}

interface PremiumButtonProps {
  onClick?: () => void
  children: React.ReactNode
  featureName: string
  className?: string
  variant?: 'default' | 'outline' | 'ghost' | 'secondary'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

export function PremiumButton({
  onClick,
  children,
  featureName,
  className,
  variant = 'default',
  size = 'default',
}: PremiumButtonProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const isPremium = currentUser.plan === 'premium'

  const handleClick = () => {
    if (isPremium) {
      onClick?.()
    } else {
      setShowUpgradeModal(true)
    }
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={cn(
          !isPremium && 'relative',
          className
        )}
        onClick={handleClick}
      >
        {children}
        {!isPremium && (
          <Lock className="ml-1 h-3 w-3 text-amber-500" />
        )}
      </Button>
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        feature={featureName}
      />
    </>
  )
}

// Badge component for premium-only indicators
interface PremiumBadgeProps {
  className?: string
}

export function PremiumBadge({ className }: PremiumBadgeProps) {
  const isPremium = currentUser.plan === 'premium'
  
  if (isPremium) return null
  
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500/10 to-orange-500/10 px-2 py-0.5 text-xs font-medium text-amber-600',
      className
    )}>
      <Crown className="h-3 w-3" />
      Premium
    </span>
  )
}
