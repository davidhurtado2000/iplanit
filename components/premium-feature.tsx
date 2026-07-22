'use client'

import React from "react"

import { useState } from 'react'
import { Crown, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { UpgradeModal } from '@/components/upgrade-modal'
import { useAuth } from '@/hooks/use-auth'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'

interface PremiumFeatureProps {
  children: React.ReactNode
  featureName: string
  className?: string
}

export function PremiumFeature({ children, featureName, className }: PremiumFeatureProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const { profile } = useAuth()
  const { t } = useLanguage()
  const isPremium = profile?.plan === 'premium'

  if (isPremium) {
    return <>{children}</>
  }

  // `children` is never mounted for non-Premium accounts - it can hold real
  // business data (revenue, client details, team member info). Blurring the
  // real content with CSS still puts that data in the DOM, so opening
  // devtools and deleting the overlay/blur classes reveals it - found in
  // production. A locked placeholder with no real data behind it can't be
  // un-blurred into anything.
  return (
    <>
      <div
        className={cn(
          'flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/20 p-8 text-center',
          className
        )}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-400/20 to-orange-500/20">
          <Crown className="h-6 w-6 text-amber-500" />
        </div>
        <div>
          <p className="font-medium text-foreground">{t.premiumFeatureTitle}</p>
          <p className="text-sm text-muted-foreground">{featureName}</p>
        </div>
        <Button
          size="sm"
          className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600"
          onClick={() => setShowUpgradeModal(true)}
        >
          <Crown className="h-4 w-4" />
          {t.premiumFeatureUnlock}
        </Button>
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
  const { profile } = useAuth()
  const isPremium = profile?.plan === 'premium'

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
  const { profile } = useAuth()
  const isPremium = profile?.plan === 'premium'

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
