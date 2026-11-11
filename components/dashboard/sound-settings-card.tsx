'use client'

import { useEffect, useState } from 'react'
import { Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useLanguage } from '@/context/language-context'
import { isSoundEnabled, playPublicBookingChime, setSoundEnabled } from '@/lib/notification-sound'

const STRINGS = {
  es: {
    title: 'Sonidos',
    desc: 'Suenan cuando algo pasa sin que lo hayas hecho tu: un cliente reserva desde tu link, un companero cambia una reserva o se cancela una cita. Tus propias acciones no suenan.',
    toggle: 'Sonidos de notificacion en este dispositivo',
    hint: 'Se guarda solo en este navegador: puedes silenciar la computadora de recepcion y dejarlos en tu celular.',
    test: 'Probar',
  },
  en: {
    title: 'Sounds',
    desc: "They play when something happens that you didn't do yourself: a client books from your link, a teammate changes a booking, or an appointment is cancelled. Your own actions are silent.",
    toggle: 'Notification sounds on this device',
    hint: 'Saved only in this browser: you can mute the front-desk computer and keep them on your phone.',
    test: 'Test',
  },
}

export function SoundSettingsCard() {
  const { language } = useLanguage()
  const s = STRINGS[language === 'en' ? 'en' : 'es']
  // Read after mount: localStorage doesn't exist during server rendering.
  const [enabled, setEnabled] = useState(true)
  useEffect(() => setEnabled(isSoundEnabled()), [])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="h-5 w-5 text-primary" />
          {s.title}
        </CardTitle>
        <CardDescription>{s.desc}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Switch
              id="sound-enabled"
              checked={enabled}
              onCheckedChange={(value) => {
                setEnabled(value)
                setSoundEnabled(value)
              }}
            />
            <div>
              <Label htmlFor="sound-enabled">{s.toggle}</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.hint}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" disabled={!enabled} onClick={playPublicBookingChime} className="shrink-0">
            {s.test}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
