'use client'

import { BellRing } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useLanguage } from '@/context/language-context'
import { usePushNotifications } from '@/lib/push/client'

const STRINGS = {
  es: {
    title: 'Avisos en el celular',
    desc: 'Recibe un aviso en este dispositivo cuando un cliente reserva desde tu link o cancela, aunque la app esté cerrada.',
    toggle: 'Activar avisos en este dispositivo',
    hint: 'Se activa en cada dispositivo por separado: actívalo en tu celular y, si quieres, también en la computadora.',
    test: 'Probar',
    on: 'Avisos activados',
    off: 'Avisos desactivados',
    testSent: 'Te enviamos un aviso de prueba',
    testFailed: 'No se pudo enviar la prueba. Intenta de nuevo.',
    failed: 'No se pudieron activar los avisos. Intenta de nuevo.',
    denied: 'Los avisos están bloqueados para este sitio en tu navegador. Actívalos en los ajustes del sitio (o del teléfono) y vuelve a intentar.',
    deniedToast: 'No diste permiso para los avisos.',
    unsupported: 'Este navegador no permite avisos. Usa Chrome (Android o computadora) o instala la app en tu iPhone.',
    iosInstall: 'En iPhone, primero instala iPlanit en la pantalla de inicio (Compartir → Agregar a inicio) y ábrela desde ahí. Después vuelve aquí para activar los avisos.',
  },
  en: {
    title: 'Phone notifications',
    desc: 'Get a notice on this device when a client books from your link or cancels, even with the app closed.',
    toggle: 'Turn on notifications on this device',
    hint: 'It is turned on per device: enable it on your phone and, if you like, on the computer too.',
    test: 'Test',
    on: 'Notifications on',
    off: 'Notifications off',
    testSent: 'We sent you a test notice',
    testFailed: 'Could not send the test. Try again.',
    failed: 'Could not turn notifications on. Try again.',
    denied: 'Notifications are blocked for this site in your browser. Allow them in the site (or phone) settings and try again.',
    deniedToast: 'Notification permission was not granted.',
    unsupported: 'This browser does not support notifications. Use Chrome (Android or computer) or install the app on your iPhone.',
    iosInstall: 'On iPhone, first install iPlanit on your home screen (Share → Add to Home Screen) and open it from there. Then come back here to turn notifications on.',
  },
}

export function PushNotificationsCard() {
  const { language } = useLanguage()
  const s = STRINGS[language === 'en' ? 'en' : 'es']
  const { state, busy, enable, disable } = usePushNotifications()

  // No key on this deployment: the feature is simply not offered.
  if (state === 'not-configured') return null

  const sendTest = async () => {
    try {
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.sent > 0) toast.success(s.testSent)
      else toast.error(s.testFailed)
    } catch {
      toast.error(s.testFailed)
    }
  }

  const onToggle = async (checked: boolean) => {
    if (!checked) return disable()
    const result = await enable()
    if (result === 'denied') toast.error(s.deniedToast)
    else if (result === 'error') toast.error(s.failed)
    else toast.success(s.on)
  }

  const blocked = state === 'denied' || state === 'unsupported' || state === 'ios-install'
  const message = state === 'denied' ? s.denied : state === 'unsupported' ? s.unsupported : state === 'ios-install' ? s.iosInstall : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-5 w-5 text-primary" />
          {s.title}
        </CardTitle>
        <CardDescription>{s.desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Switch
              id="push-enabled"
              checked={state === 'on'}
              disabled={busy || blocked || state === 'loading'}
              onCheckedChange={onToggle}
            />
            <div>
              <Label htmlFor="push-enabled">{s.toggle}</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.hint}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" disabled={state !== 'on' || busy} onClick={sendTest} className="shrink-0">
            {s.test}
          </Button>
        </div>
        {message && <p className="text-sm text-amber-700 dark:text-amber-400">{message}</p>}
      </CardContent>
    </Card>
  )
}
