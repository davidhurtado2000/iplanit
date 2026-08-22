'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useBusinesses } from '@/hooks/use-businesses'
import { useLanguage } from '@/context/language-context'
import { FREE_LIMITS, PRO_LIMITS, type PlanTier } from '@/lib/plan-limits'
import { Button } from '@/components/ui/button'
import { UpgradeModal } from '@/components/upgrade-modal'

interface PlanUsage {
  plan: PlanTier
  reservations_this_month: number
  clients: number
  services: number
  resources: number
  team_seats: number
}

interface OverLimitItem {
  label: string
  used: number
  limit: number
}

// Business-scoped (via get_plan_usage, resolved through the owner's plan) -
// deliberately NOT PremiumFeature/meetsPlan, which answer "does my own
// account's tier unlock this," not "has this business's usage gone over its
// current plan's cap." Distinct from the unconditional "you're on Free"
// upsell card on the dashboard home page (app/(dashboard)/dashboard/page.tsx)
// - this one only appears when a real cap has actually been exceeded
// (typically after a trial ends or a downgrade), and only to the owner,
// since staff don't manage billing.
export function PlanUsageBanner() {
  const { currentBusiness, businesses } = useBusinesses()
  const { language } = useLanguage()
  const [usage, setUsage] = useState<PlanUsage | null>(null)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  useEffect(() => {
    if (!currentBusiness || currentBusiness.role !== 'owner') {
      setUsage(null)
      return
    }
    let cancelled = false
    const supabase = createClient()
    supabase
      .rpc('get_plan_usage', { p_business_id: currentBusiness.id })
      .then(({ data }) => {
        if (cancelled) return
        if (data && typeof data === 'object' && !('error' in data)) {
          setUsage(data as unknown as PlanUsage)
        } else {
          setUsage(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [currentBusiness?.id, currentBusiness?.role])

  if (!currentBusiness || currentBusiness.role !== 'owner' || !usage || usage.plan === 'premium') {
    return null
  }

  const labels =
    language === 'es'
      ? {
          reservations: 'Reservas este mes',
          clients: 'Clientes',
          services: 'Servicios',
          resources: 'Recursos',
          teamSeats: 'Cupos de equipo',
          sedes: 'Sedes',
          title: 'Estas sobre el limite de tu plan actual',
          body: 'Tus datos existentes siguen intactos y accesibles - solo no podras crear mas de lo que tu plan permite hasta que actualices.',
          cta: 'Actualizar plan',
        }
      : {
          reservations: 'Reservations this month',
          clients: 'Clients',
          services: 'Services',
          resources: 'Resources',
          teamSeats: 'Team seats',
          sedes: 'Locations',
          title: "You're over your current plan's limits",
          body: "Your existing data is safe and still accessible - you just can't create more than your plan allows until you upgrade.",
          cta: 'Upgrade plan',
        }

  const items: OverLimitItem[] = []
  const sedeCount = businesses.filter((b) => b.organization_id === currentBusiness.organization_id).length

  if (usage.plan === 'free') {
    if (usage.reservations_this_month > FREE_LIMITS.reservationsPerMonth) {
      items.push({ label: labels.reservations, used: usage.reservations_this_month, limit: FREE_LIMITS.reservationsPerMonth })
    }
    if (usage.clients > FREE_LIMITS.clients) {
      items.push({ label: labels.clients, used: usage.clients, limit: FREE_LIMITS.clients })
    }
    if (usage.services > FREE_LIMITS.services) {
      items.push({ label: labels.services, used: usage.services, limit: FREE_LIMITS.services })
    }
    if (usage.resources > FREE_LIMITS.resources) {
      items.push({ label: labels.resources, used: usage.resources, limit: FREE_LIMITS.resources })
    }
  } else if (usage.plan === 'pro') {
    if (usage.services > PRO_LIMITS.services) {
      items.push({ label: labels.services, used: usage.services, limit: PRO_LIMITS.services })
    }
    if (usage.resources > PRO_LIMITS.resources) {
      items.push({ label: labels.resources, used: usage.resources, limit: PRO_LIMITS.resources })
    }
    if (usage.team_seats > PRO_LIMITS.teamSeats) {
      items.push({ label: labels.teamSeats, used: usage.team_seats, limit: PRO_LIMITS.teamSeats })
    }
  }

  // Sedes beyond #1 always require Premium, regardless of Free vs Pro.
  if (sedeCount > 1) {
    items.push({ label: labels.sedes, used: sedeCount, limit: 1 })
  }

  if (items.length === 0) return null

  return (
    <>
      <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-semibold text-foreground">{labels.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{labels.body}</p>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-destructive">
                {items.map((item) => (
                  <li key={item.label}>
                    {item.label}: {item.used}/{item.limit}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <Button
            size="sm"
            className="shrink-0 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600"
            onClick={() => setShowUpgradeModal(true)}
          >
            {labels.cta}
          </Button>
        </div>
      </div>
      <UpgradeModal isOpen={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />
    </>
  )
}
