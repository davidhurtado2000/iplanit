// Saca las capturas de marketing de iPlanit con Playwright.
//
//   1. node --env-file=.env.local scripts/capturas/seed.mjs   (una vez)
//   2. npx next dev -p 3005                                    (en otra terminal)
//   3. node --env-file=.env.local scripts/capturas/capturas.mjs [mobile|desktop]
//
// Guarda vertical (390x844 @3x) en capturas/ y horizontal (1440x900 @2x) en
// capturas/horizontal/. La reserva pública se simula en el navegador: no se
// crea ninguna cita real ni se envía ningún mensaje.
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const BASE = process.env.CAPTURAS_BASE_URL || 'http://localhost:3005'
const state = JSON.parse(readFileSync(join(HERE, '.demo-state.json'), 'utf8'))
const only = process.argv[2] // opcional: "mobile" o "desktop"

// El login de la app exige captcha (Turnstile), así que la sesión del usuario
// demo se crea aquí: un magic link generado con la service role (nunca se
// envía por email) se canjea con @supabase/ssr, y las cookies resultantes
// (mismo formato que usa la app) se pasan al navegador.
let cachedCookies = null
async function demoSessionCookies() {
  if (cachedCookies) return cachedCookies
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: state.email })
  if (error) throw new Error(`generateLink: ${error.message}`)

  const jar = new Map()
  const ssr = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
    },
  })
  const { error: otpError } = await ssr.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' })
  if (otpError) throw new Error(`verifyOtp: ${otpError.message}`)

  const { hostname } = new URL(BASE)
  cachedCookies = [...jar].map(([name, value]) => ({ name, value, domain: hostname, path: '/', sameSite: 'Lax' }))
  return cachedCookies
}

const VARIANTS = [
  { name: 'mobile', dir: join(ROOT, 'capturas'), viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: 'desktop', dir: join(ROOT, 'capturas', 'horizontal'), viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
].filter((v) => !only || v.name === only)

// Oculta todo lo que no debe salir en un video: indicador de Next en dev,
// botón lateral de feedback, toasts y el captcha.
const HIDE_CSS = `
  nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }
  button.fixed.right-0 { display: none !important; }
  [data-sonner-toaster], ol[tabindex="-1"][class*="toast"] { display: none !important; }
  iframe[src*="challenges.cloudflare.com"] { display: none !important; }
  *, *::before, *::after { caret-color: transparent !important; }
`

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForFunction(() => !document.querySelector('.animate-spin'), null, { timeout: 15000 }).catch(() => {})
  await page.addStyleTag({ content: HIDE_CSS }).catch(() => {})
  await page.waitForTimeout(900) // animaciones de entrada (framer-motion)
}

async function shot(page, variant, file, beforeShot) {
  await settle(page)
  if (beforeShot) {
    await beforeShot(page)
    await page.waitForTimeout(400)
  }
  const path = join(variant.dir, file)
  await page.screenshot({ path })
  console.log(`  ✓ ${variant.name}/${file}`)
}

async function newContext(browser, variant) {
  const context = await browser.newContext({
    viewport: variant.viewport,
    deviceScaleFactor: variant.deviceScaleFactor,
    isMobile: variant.isMobile,
    hasTouch: variant.hasTouch,
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    colorScheme: 'light',
  })
  await context.addInitScript(() => {
    try {
      localStorage.setItem('cookie-consent', 'rejected')
      localStorage.setItem('app-language', 'es')
    } catch {}
  })
  // Sin analytics ni captcha externos.
  await context.route(/googletagmanager|google-analytics|vercel-insights|_vercel\/insights/, (r) => r.abort())
  await context.route(/challenges\.cloudflare\.com/, (r) => r.abort())
  // La reserva pública se responde aquí mismo: nada llega a la base de datos.
  await context.route('**/api/public/reservations', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  )
  return context
}

async function captureVariant(browser, variant) {
  mkdirSync(variant.dir, { recursive: true })
  console.log(`\n${variant.name} (${variant.viewport.width}x${variant.viewport.height})`)

  // ---- Páginas públicas (sin login) ----
  const pub = await newContext(browser, variant)
  const page = await pub.newPage()
  await page.goto(`${BASE}/reservar/${state.slug}`)
  await page.getByText('Corte + barba').first().waitFor()
  await shot(page, variant, '03-reserva-cliente.png')

  await page.getByText('Corte + barba').first().click()
  await settle(page)
  // Si aparece un paso para elegir barbero, se elige el primero.
  const pickWorker = page.getByText('Carlos Ramírez').first()
  if (await pickWorker.isVisible().catch(() => false)) {
    await pickWorker.click()
    await settle(page)
  }
  // Mañana (o el siguiente día disponible) y el primer horario libre.
  await pickDateAndSlot(page)
  await shot(page, variant, '04-reserva-horario.png')

  await page.getByRole('button', { name: /continuar|siguiente/i }).first().click()
  await settle(page)
  await page.locator('#pb-name').first().fill('Luis Mendoza')
  const phone = page.locator('#pb-phone').first()
  if (await phone.isVisible().catch(() => false)) await phone.fill('900 000 010')
  await page.locator('form button[type="submit"]').last().click()
  await page.waitForTimeout(500)
  await shot(page, variant, '05-reserva-confirmada.png')
  await pub.close()

  // ---- Dashboard (con login del usuario demo) ----
  const dash = await newContext(browser, variant)
  await dash.addCookies(await demoSessionCookies())
  const d = await dash.newPage()
  await d.goto(`${BASE}/dashboard`)
  await d.waitForURL(/\/dashboard/, { timeout: 30000 })

  await d.goto(`${BASE}/dashboard/services`)
  await d.getByText('Perfilado de barba').first().waitFor()
  await shot(d, variant, '01-servicios.png')

  await d.goto(`${BASE}/dashboard/workers`)
  await d.getByText('Diego Torres').first().waitFor()
  await shot(d, variant, '02-equipo-horarios.png')

  await d.goto(`${BASE}/dashboard/calendar`)
  await d.getByText(/Luis Mendoza|Corte clásico/).first().waitFor({ timeout: 20000 }).catch(() => {})
  await shot(d, variant, '06-calendario.png', scrollCalendarToMorning)

  await d.goto(`${BASE}/dashboard/notifications`)
  await shot(d, variant, '07-recordatorio.png')
  await dash.close()
}

async function pickDateAndSlot(page) {
  // El selector de fecha es "‹ mié, 21 oct ›": avanza un día con la flecha
  // derecha hasta encontrar un día con horarios libres (máx. 7 intentos).
  const nextDay = page.locator('div.rounded-lg.border.p-2 > button').last()
  const slots = page.getByRole('button', { name: /^\d{1,2}:\d{2}/ })
  for (let i = 0; i < 7; i++) {
    await nextDay.click()
    await settle(page)
    if ((await slots.count()) >= 3) break
  }
  const slot = slots.nth(2)
  await slot.click()
  await page.waitForTimeout(300)
}

async function scrollCalendarToMorning(page) {
  // Deja arriba la barra "‹ › Hoy" + la fecha, para que debajo se vean las
  // citas de la mañana (el header fijo móvil mide ~56px).
  const today = page.getByRole('button', { name: /^Hoy$/ }).first()
  if (await today.isVisible().catch(() => false)) {
    await today.evaluate((el) => {
      const top = el.getBoundingClientRect().top + window.scrollY
      window.scrollTo(0, Math.max(0, top - 72))
    })
  }
}

const browser = await chromium.launch()
try {
  for (const variant of VARIANTS) await captureVariant(browser, variant)
} finally {
  await browser.close()
}
console.log('\nListo.')
