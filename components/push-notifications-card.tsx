'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BellRing } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useLanguage } from '@/context/language-context'
import { detectPlatform, usePushNotifications, type PushPlatform } from '@/lib/push/client'

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
    tipsTitle: '¿No te llega o suena bajo?',
    tipsSound: 'El sonido es el de tu teléfono, no el de iPlanit: se cambia en los ajustes de notificaciones del teléfono.',
    tipsMore: 'Ver la guía completa',
    tips: {
      android: [
        'Quita el modo "No molestar" y sube el volumen de notificaciones.',
        'En los ajustes del teléfono, revisa que las notificaciones de Chrome (o de iPlanit, si la instalaste) estén permitidas.',
        'Si el teléfono tiene ahorro de batería, saca a Chrome de la lista de apps restringidas.',
        'Toca Probar: si llega el aviso de prueba, todo está bien.',
      ],
      ios: [
        'Abre iPlanit siempre desde su ícono en la pantalla de inicio, no desde Safari.',
        'En Ajustes → Notificaciones → iPlanit, deja las notificaciones permitidas y con sonido.',
        'Revisa que no esté activo un modo de Concentración o No molestar.',
        'Toca Probar: si llega el aviso de prueba, todo está bien.',
      ],
      desktop: [
        'Revisa que el navegador tenga permitidas las notificaciones para este sitio (el candado junto a la dirección).',
        'Revisa que Windows o macOS no tengan activado No molestar o el Asistente de concentración.',
        'Toca Probar: si llega el aviso de prueba, todo está bien.',
      ],
    },
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
    tipsTitle: "Not arriving, or too quiet?",
    tipsSound: "The sound is your phone's, not iPlanit's: change it in the phone's notification settings.",
    tipsMore: 'See the full guide',
    tips: {
      android: [
        'Turn off Do Not Disturb and raise the notification volume.',
        "In the phone settings, make sure Chrome's notifications (or iPlanit's, if you installed it) are allowed.",
        'If the phone has battery saver, take Chrome off the restricted apps list.',
        'Tap Test: if the test notice arrives, everything is fine.',
      ],
      ios: [
        'Always open iPlanit from its home screen icon, not from Safari.',
        'In Settings → Notifications → iPlanit, keep notifications allowed and with sound.',
        'Check that no Focus mode or Do Not Disturb is on.',
        'Tap Test: if the test notice arrives, everything is fine.',
      ],
      desktop: [
        "Check that the browser allows notifications for this site (the padlock next to the address).",
        'Check that Windows or macOS do not have Do Not Disturb or Focus assist on.',
        'Tap Test: if the test notice arrives, everything is fine.',
      ],
    },
  },
}

export function PushNotificationsCard() {
  const { language } = useLanguage()
  const s = STRINGS[language === 'en' ? 'en' : 'es']
  const { state, busy, enable, disable } = usePushNotifications()
  const pathname = usePathname()
  // Read after mount: the device type does not exist while rendering on the server.
  const [platform, setPlatform] = useState<PushPlatform>('desktop')
  useEffect(() => setPlatform(detectPlatform()), [])
  const helpHref = pathname?.startsWith('/mi-agenda') ? '/mi-agenda/ayuda' : '/dashboard/ayuda/avisos-celular'

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

        <details className="group rounded-lg border px-3 py-2 text-sm">
          <summary className="cursor-pointer select-none font-medium">{s.tipsTitle}</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            {s.tips[platform].map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">{s.tipsSound}</p>
          <Link href={helpHref} className="mt-2 inline-block text-xs text-primary hover:underline">
            {s.tipsMore}
          </Link>
        </details>
      </CardContent>
    </Card>
  )
}
