'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Crown, Zap, BarChart3, Users, Clock, Mail } from 'lucide-react'

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
  feature?: string
}

const PREMIUM_FEATURES = [
  {
    icon: BarChart3,
    title: 'Reportes y Analiticas',
    description: 'Graficos de horas pico, servicios mas solicitados y revenue',
  },
  {
    icon: Users,
    title: 'Historial de Clientes',
    description: 'Accede al historial completo de reservas por cliente',
  },
  {
    icon: Clock,
    title: 'Reservas Ilimitadas',
    description: 'Sin limite de reservas mensuales',
  },
  {
    icon: Mail,
    title: 'Notificaciones Avanzadas',
    description: 'Recordatorios automaticos por email y SMS',
  },
]

const FREE_LIMITS = {
  reservationsPerMonth: 50,
  clients: 20,
  services: 3,
  resources: 2,
}

export function UpgradeModal({ isOpen, onClose, feature }: UpgradeModalProps) {
  const handleContactUs = () => {
    window.open(
      'mailto:ventas@iPlannit.app?subject=Solicitud%20de%20Plan%20Premium&body=Hola,%20me%20interesa%20actualizar%20a%20Premium.',
      '_blank'
    )
  }

  const handleWhatsApp = () => {
    window.open(
      'https://wa.me/51999999999?text=Hola,%20me%20interesa%20el%20Plan%20Premium%20de%20iPlannit',
      '_blank'
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500">
            <Crown className="h-7 w-7 text-white" />
          </div>
          <DialogTitle className="text-center text-xl">
            Actualiza a Premium
          </DialogTitle>
          <DialogDescription className="text-center">
            {feature
              ? `La funcion "${feature}" esta disponible solo en el plan Premium.`
              : 'Desbloquea todas las funciones y lleva tu negocio al siguiente nivel.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Pricing */}
          <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 text-center sm:p-6">
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-3xl font-bold text-foreground sm:text-4xl">$20</span>
              <span className="text-muted-foreground text-sm sm:text-base">/mes</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              Facturacion mensual
            </p>
            <Badge className="mt-3 gap-1 bg-primary/10 text-primary hover:bg-primary/10">
              <Zap className="h-3 w-3" />
              Ahorra 20% con pago anual
            </Badge>
          </div>

          {/* Features */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-foreground sm:text-sm">
              Todo lo incluido en Free, mas:
            </p>
            {PREMIUM_FEATURES.map((feature) => (
              <div key={feature.title} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20">
                  <Check className="h-3 w-3 text-accent" />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground sm:text-sm">
                    {feature.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Free Plan Limits Info */}
          <div className="rounded-lg bg-muted/50 p-3 sm:p-4">
            <p className="mb-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide sm:text-xs">
              Limites del Plan Gratuito
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reservas/mes:</span>
                <span className="font-medium">{FREE_LIMITS.reservationsPerMonth}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Clientes:</span>
                <span className="font-medium">{FREE_LIMITS.clients}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Servicios:</span>
                <span className="font-medium">{FREE_LIMITS.services}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Recursos:</span>
                <span className="font-medium">{FREE_LIMITS.resources}</span>
              </div>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="space-y-3">
            <Button
              className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600"
              size="lg"
              onClick={handleWhatsApp}
            >
              <Crown className="h-4 w-4" />
              Solicitar Premium por WhatsApp
            </Button>
            <Button
              variant="outline"
              className="w-full bg-transparent"
              onClick={handleContactUs}
            >
              Contactar por Email
            </Button>
            <p className="text-center text-[10px] text-muted-foreground sm:text-xs">
              Tu cuenta se activara en menos de 24 horas despues del pago.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Exportamos los limites para usar en otras partes de la app
export { FREE_LIMITS }
