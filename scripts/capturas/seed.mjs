// Crea un negocio demo 100% ficticio ("Barbería El Filo") para sacar capturas
// de marketing. Corre contra el Supabase de .env.local usando la service role.
//
//   node --env-file=.env.local scripts/capturas/seed.mjs
//
// Guarda email/contraseña/slug en scripts/capturas/.demo-state.json (ignorado
// por git). Para borrar todo después: scripts/capturas/cleanup.mjs
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const STATE_FILE = join(dirname(fileURLToPath(import.meta.url)), '.demo-state.json')
const EMAIL = 'demo.barberia@example.com'
const SLUG = 'barberia-el-filo-demo'
const TZ_OFFSET = '-05:00' // America/Lima, sin horario de verano

if (existsSync(STATE_FILE)) {
  console.error('Ya existe un demo (.demo-state.json). Corre cleanup.mjs primero.')
  process.exit(1)
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

function check(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  return result.data
}

// Fecha local de Lima (YYYY-MM-DD) desplazada `days` días desde hoy.
function limaDate(days) {
  const now = new Date(Date.now() - 5 * 3600 * 1000 + days * 86400 * 1000)
  return now.toISOString().slice(0, 10)
}
const at = (days, hhmm) => `${limaDate(days)}T${hhmm}:00${TZ_OFFSET}`
const addMin = (iso, min) => new Date(new Date(iso).getTime() + min * 60000).toISOString()

const password = `Demo-${randomBytes(9).toString('base64url')}`

// 1. Usuario + perfil + organización + negocio (el trigger handle_new_user
//    crea organización y negocio a partir de la metadata).
const { user } = check(
  await supabase.auth.admin.createUser({
    email: EMAIL,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: 'Andrés Demo',
      business_name: 'Barbería El Filo',
      business_type: 'salon',
      business_country: 'PE',
      timezone: 'America/Lima',
      language: 'es',
    },
  }),
  'createUser'
)
// Guardar estado apenas existe el usuario, así cleanup funciona aunque algo falle después.
const state = { email: EMAIL, password, slug: SLUG, userId: user.id }
writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))

try {
  check(
    await supabase
      .from('profiles')
      .update({ plan: 'pro', billing_exempt: true, requires_plan_selection: false, language: 'es', full_name: 'Andrés Demo' })
      .eq('id', user.id),
    'profiles'
  )

  const business = check(
    await supabase.from('businesses').select('id, organization_id').eq('owner_id', user.id).single(),
    'business lookup'
  )
  state.businessId = business.id
  state.organizationId = business.organization_id
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))

  check(
    await supabase
      .from('businesses')
      .update({
        slug: SLUG,
        description: 'Cortes clásicos y modernos, perfilado de barba y buena música. Reserva tu turno en segundos.',
        phone: '+51 900 000 000',
        address: 'Av. Ejemplo 123',
        city: 'Lima',
        worker_label_singular: 'Barbero',
        worker_label_plural: 'Barberos',
        reminder_hours: 24,
      })
      .eq('id', business.id),
    'business update'
  )

  // 2. Horario del local: lunes a sábado 9:00–20:00, domingo cerrado.
  const hours = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    business_id: business.id,
    day_of_week: d,
    open_time: '09:00',
    close_time: d === 6 ? '18:00' : '20:00',
    is_closed: d === 0,
  }))
  check(await supabase.from('business_hours').upsert(hours, { onConflict: 'business_id,day_of_week' }), 'business_hours')

  // 3. Servicios.
  const services = check(
    await supabase
      .from('services')
      .insert([
        { business_id: business.id, name: 'Corte clásico', description: 'Corte a tijera o máquina, lavado y peinado.', duration_minutes: 30, price: 35, color: '#3b82f6' },
        { business_id: business.id, name: 'Corte + barba', description: 'Corte completo y perfilado de barba con toalla caliente.', duration_minutes: 45, price: 50, color: '#8b5cf6' },
        { business_id: business.id, name: 'Perfilado de barba', description: 'Diseño y perfilado con navaja.', duration_minutes: 20, price: 25, color: '#10b981' },
      ])
      .select('id, name, duration_minutes, price'),
    'services'
  )

  // 4. Equipo: 2 barberos con sus propios horarios.
  const workers = check(
    await supabase
      .from('workers')
      .insert([
        { business_id: business.id, name: 'Carlos Ramírez', color: '#f59e0b' },
        { business_id: business.id, name: 'Diego Torres', color: '#06b6d4' },
      ])
      .select('id, name'),
    'workers'
  )
  const [carlos, diego] = workers
  const workerHours = []
  for (let d = 0; d <= 6; d++) {
    workerHours.push({ business_id: business.id, worker_id: carlos.id, day_of_week: d, open_time: '09:00', close_time: '17:00', is_closed: d === 0 || d === 6 })
    workerHours.push({ business_id: business.id, worker_id: diego.id, day_of_week: d, open_time: '12:00', close_time: '20:00', is_closed: d === 0 || d === 1 })
  }
  check(await supabase.from('worker_hours').insert(workerHours), 'worker_hours')
  check(
    await supabase
      .from('worker_services')
      .insert(workers.flatMap((w) => services.map((s) => ({ business_id: business.id, worker_id: w.id, service_id: s.id })))),
    'worker_services'
  )

  // 5. Clientes ficticios. Solo teléfono (sin email) para que ningún
  //    recordatorio automático intente enviar correos.
  const clientNames = ['Luis Mendoza', 'Jorge Castillo', 'Martín Salazar', 'Renzo Paredes', 'Bruno Vargas', 'Iván Rojas', 'Sebastián Quispe', 'Mateo Flores']
  const clients = check(
    await supabase
      .from('clients')
      .insert(clientNames.map((name, i) => ({ business_id: business.id, organization_id: business.organization_id, name, phone: `+51 900 000 0${String(i + 10)}` })))
      .select('id, name'),
    'clients'
  )

  // 6. Citas: hoy y los próximos días, repartidas entre los dos barberos.
  const [corte, corteBarba, barba] = services
  const plan = [
    [0, '09:30', corte, carlos, 0, 'confirmed'],
    [0, '10:30', corteBarba, carlos, 1, 'confirmed'],
    [0, '12:00', corte, diego, 2, 'confirmed'],
    [0, '13:00', barba, carlos, 3, 'confirmed'],
    [0, '15:00', corteBarba, diego, 4, 'confirmed'],
    [0, '16:30', corte, diego, 5, 'pending'],
    [0, '18:00', corte, diego, 6, 'confirmed'],
    [1, '10:00', corte, carlos, 7, 'confirmed'],
    [1, '12:30', corteBarba, diego, 0, 'confirmed'],
    [1, '15:00', barba, carlos, 1, 'pending'],
    [1, '17:30', corte, diego, 2, 'confirmed'],
    [2, '09:00', corteBarba, carlos, 3, 'confirmed'],
    [2, '11:00', corte, carlos, 4, 'confirmed'],
    [2, '14:00', corte, diego, 5, 'confirmed'],
    [2, '16:00', barba, diego, 6, 'confirmed'],
    [3, '10:00', corte, carlos, 7, 'confirmed'],
    [3, '13:30', corteBarba, diego, 1, 'confirmed'],
  ]
  check(
    await supabase.from('reservations').insert(
      plan.map(([day, time, svc, worker, ci, status]) => {
        const start = at(day, time)
        return {
          business_id: business.id,
          service_id: svc.id,
          client_id: clients[ci].id,
          worker_id: worker.id,
          start_time: new Date(start).toISOString(),
          end_time: addMin(start, svc.duration_minutes),
          status,
          price: svc.price,
        }
      })
    ),
    'reservations'
  )

  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
  console.log(`Demo creado: ${EMAIL} · /reservar/${SLUG} · ${plan.length} citas`)
} catch (err) {
  console.error(err.message)
  console.error('El seed falló a medias. Corre cleanup.mjs para borrar lo creado.')
  process.exit(1)
}
