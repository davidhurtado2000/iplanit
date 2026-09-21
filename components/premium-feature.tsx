'use client'

import React from "react"

import { useState } from 'react'
import { Crown, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { UpgradeModal } from '@/components/upgrade-modal'
import { useAuth } from '@/hooks/use-auth'
import { useBusinesses } from '@/hooks/use-businesses'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import { meetsPlan } from '@/lib/plan-limits'

// Same 3 colors as the plan cards (upgrade-modal.tsx / landing pricing.tsx)
// - muted/blue/ink - so a locked-feature placeholder or badge always
// matches whichever tier it's actually gated behind, instead of every
// gate looking like a generic "Premium" nudge in amber. Only used where
// the element fully controls its own background (icon circle, its own
// button, a self-contained badge pill) - PremiumButton's inline Lock
// below stays amber on purpose: it composites onto whatever variant/
// color the caller gave that button, and a black or blue lock can go
// invisible against a same-colored button in a way amber never does.
const TIER_ACCENT = {
  basic: {
    iconWrap: 'bg-muted',
    icon: 'text-muted-foreground',
    button: 'bg-muted-foreground/15 text-foreground hover:bg-muted-foreground/25',
    badge: 'bg-muted text-muted-foreground',
  },
  pro: {
    iconWrap: 'bg-primary/15',
    icon: 'text-primary',
    button: 'bg-primary text-primary-foreground hover:bg-primary/90',
    badge: 'bg-primary/10 text-primary',
  },
  premium: {
    iconWrap: 'bg-neutral-950/10 dark:bg-white/10',
    icon: 'text-neutral-900 dark:text-white',
    button: 'bg-neutral-950 text-white hover:bg-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-700',
    badge: 'bg-neutral-950/10 text-neutral-900 dark:bg-white/10 dark:text-white',
  },
} as const

interface PremiumFeatureProps {
  children: React.ReactNode
  featureName: string
  className?: string
  requiredPlan?: 'basic' | 'pro' | 'premium'
}

export function PremiumFeature({ children, featureName, className, requiredPlan = 'premium' }: PremiumFeatureProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const { profile } = useAuth()
  // Resolved through the business owner (aiAddonStatus.plan, see scripts/
  // 079-ai-addon-owner-resolution.sql - named for the AI add-on but
  // carries the business's real plan generally), not the caller's own
  // profile - a staff member's own profile.plan is typically 'free' (their
  // own separate signup), which would otherwise lock every Pro/Premium
  // feature behind this component for staff on a paid business. This is
  // the single shared gate used across the whole dashboard, so this fix
  // covers every PremiumFeature/PremiumButton/PremiumBadge usage at once.
  const { aiAddonStatus } = useBusinesses()
  const { t } = useLanguage()
  const hasAccess = meetsPlan(aiAddonStatus?.plan ?? profile?.plan, requiredPlan)

  if (hasAccess) {
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
        <div className={cn('flex h-12 w-12 items-center justify-center rounded-full', TIER_ACCENT[requiredPlan].iconWrap)}>
          <Crown className={cn('h-6 w-6', TIER_ACCENT[requiredPlan].icon)} />
        </div>
        <div>
          <p className="font-medium text-foreground">
            {requiredPlan === 'premium' ? t.premiumFeatureTitle : requiredPlan === 'pro' ? t.proFeatureTitle : t.basicFeatureTitle}
          </p>
          <p className="text-sm text-muted-foreground">{featureName}</p>
        </div>
        <Button
          size="sm"
          className={cn('gap-2', TIER_ACCENT[requiredPlan].button)}
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
        requiredPlan={requiredPlan}
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
  requiredPlan?: 'basic' | 'pro' | 'premium'
}

export function PremiumButton({
  onClick,
  children,
  featureName,
  className,
  variant = 'default',
  size = 'default',
  requiredPlan = 'premium',
}: PremiumButtonProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const { profile } = useAuth()
  const { aiAddonStatus } = useBusinesses()
  const hasAccess = meetsPlan(aiAddonStatus?.plan ?? profile?.plan, requiredPlan)

  const handleClick = () => {
    if (hasAccess) {
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
          !hasAccess && 'relative',
          className
        )}
        onClick={handleClick}
      >
        {children}
        {!hasAccess && (
          <Lock className="ml-1 h-3 w-3 text-amber-500" />
        )}
      </Button>
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        feature={featureName}
        requiredPlan={requiredPlan}
      />
    </>
  )
}

// Badge component for premium/pro-only indicators
interface PremiumBadgeProps {
  className?: string
  requiredPlan?: 'basic' | 'pro' | 'premium'
}

export function PremiumBadge({ className, requiredPlan = 'premium' }: PremiumBadgeProps) {
  const { profile } = useAuth()
  const { aiAddonStatus } = useBusinesses()
  const hasAccess = meetsPlan(aiAddonStatus?.plan ?? profile?.plan, requiredPlan)

  if (hasAccess) return null

  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
      TIER_ACCENT[requiredPlan].badge,
      className
    )}>
      <Crown className="h-3 w-3" />
      {requiredPlan === 'pro' ? 'Pro' : 'Premium'}
    </span>
  )
}
