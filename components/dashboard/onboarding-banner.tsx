'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Building2,
  Briefcase,
  Users,
  Calendar,
  CheckCircle2,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { useLanguage } from '@/context/language-context'

interface OnboardingBannerProps {
  hasBusiness: boolean
  hasServices: boolean
  hasClients: boolean
  hasReservations: boolean
}

export function OnboardingBanner({
  hasBusiness,
  hasServices,
  hasClients,
  hasReservations,
}: OnboardingBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  const { t } = useLanguage()

  const steps = [
    {
      id: 'business',
      title: t.onboarding.steps.business.title,
      description: t.onboarding.steps.business.desc,
      icon: Building2,
      href: '/dashboard/settings',
      completed: hasBusiness,
    },
    {
      id: 'services',
      title: t.onboarding.steps.services.title,
      description: t.onboarding.steps.services.desc,
      icon: Briefcase,
      href: '/dashboard/services',
      completed: hasServices,
    },
    {
      id: 'clients',
      title: t.onboarding.steps.clients.title,
      description: t.onboarding.steps.clients.desc,
      icon: Users,
      href: '/dashboard/clients',
      completed: hasClients,
    },
    {
      id: 'reservations',
      title: t.onboarding.steps.reservations.title,
      description: t.onboarding.steps.reservations.desc,
      icon: Calendar,
      href: '/dashboard/calendar',
      completed: hasReservations,
    },
  ]

  const completedSteps = steps.filter((s) => s.completed).length
  const progress = (completedSteps / steps.length) * 100
  const allCompleted = completedSteps === steps.length

  if (dismissed || allCompleted) {
    return null
  }

  const nextStep = steps.find((s) => !s.completed)

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{t.onboarding.title}</CardTitle>
              <CardDescription>{t.onboarding.subtitle}</CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setDismissed(true)}
          >
            {t.onboarding.hide}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t.onboarding.progress}</span>
            <span className="font-medium">
              {completedSteps} {t.onboarding.of} {steps.length} {t.onboarding.completed}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Steps */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <Link
              key={step.id}
              href={step.href}
              className={`group relative flex flex-col gap-2 rounded-lg border p-3 transition-all ${
                step.completed
                  ? 'border-green-200 bg-green-50/50'
                  : step.id === nextStep?.id
                  ? 'border-primary bg-primary/5 hover:bg-primary/10'
                  : 'border-muted hover:border-primary/50 hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center gap-2">
                {step.completed ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <step.icon className={`h-5 w-5 ${step.id === nextStep?.id ? 'text-primary' : 'text-muted-foreground'}`} />
                )}
                <span className={`text-sm font-medium ${step.completed ? 'text-green-700' : ''}`}>
                  {step.title}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{step.description}</p>
              {step.id === nextStep?.id && !step.completed && (
                <div className="mt-1 flex items-center gap-1 text-xs font-medium text-primary">
                  {t.onboarding.start} <ArrowRight className="h-3 w-3" />
                </div>
              )}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
