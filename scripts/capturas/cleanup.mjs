// Borra todo lo que creó seed.mjs (negocio demo, organización, usuario).
//
//   node --env-file=.env.local scripts/capturas/cleanup.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync, rmSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const STATE_FILE = join(dirname(fileURLToPath(import.meta.url)), '.demo-state.json')
if (!existsSync(STATE_FILE)) {
  console.log('No hay demo que borrar (.demo-state.json no existe).')
  process.exit(0)
}
const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'))

// Seguridad: solo toca el usuario demo, nunca otra cuenta.
if (state.email !== 'demo.barberia@example.com') {
  console.error(`Email inesperado en el estado: ${state.email}. No borro nada.`)
  process.exit(1)
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function run(label, promise) {
  const { error } = await promise
  if (error) throw new Error(`${label}: ${error.message}`)
}

const { data: businesses } = await supabase.from('businesses').select('id, organization_id').eq('owner_id', state.userId)
for (const b of businesses ?? []) {
  // Hijos con FK a businesses (la mayoría tiene on delete cascade, pero se
  // borran explícitamente por si alguno no).
  for (const table of ['notifications', 'activity_log', 'reservations', 'clients', 'worker_services', 'worker_hours', 'workers', 'services', 'business_hours']) {
    await run(table, supabase.from(table).delete().eq('business_id', b.id))
  }
  await run('businesses', supabase.from('businesses').delete().eq('id', b.id))
}
await run('public_booking_attempts', supabase.from('public_booking_attempts').delete().eq('slug', state.slug))
await run('organizations', supabase.from('organizations').delete().eq('owner_id', state.userId))
await run('auth user', supabase.auth.admin.deleteUser(state.userId))

rmSync(STATE_FILE)
console.log('Demo borrado por completo.')
