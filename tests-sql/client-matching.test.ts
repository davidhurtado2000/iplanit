// Runs scripts/124-client-matching-v1.sql (and its rollback) against a local
// Postgres (PGlite) and checks the client-recognition rules, including that the
// SQL name rule gives the same answer as the TypeScript one (lib/client-match.ts).
//
//   pnpm test:sql
//
// What this proves: the scripts are valid SQL, re-runnable, and the matcher does
// what the rules say. What it does NOT prove: the full booking flow (it needs
// dozens of tables), or anything specific to Supabase itself - after applying a
// script, still make one test booking.
import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { namesCompatible } from '@/lib/client-match'

const SCRIPTS = path.resolve(__dirname, '..', 'scripts')
const read = (file: string) => fs.readFileSync(path.join(SCRIPTS, file), 'utf8')

const ORG = '11111111-1111-1111-1111-111111111111'

let db: PGlite

type MatchRow = { client_id: string | null; reason: string; skip_document: boolean }

async function addClient(
  name: string,
  email: string | null,
  phone: string | null,
  doc: string | null,
  opts: { active?: boolean; created?: string } = {}
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into clients (organization_id, name, email, phone, document_number, is_active, created_at)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [ORG, name, email, phone, doc, opts.active ?? true, opts.created ?? '2026-01-01']
  )
  return rows[0].id
}

async function find(
  name: string,
  email: string | null,
  phone: string | null,
  doc: string | null,
  country = 'PE'
): Promise<MatchRow> {
  const { rows } = await db.query<MatchRow>('select * from public.find_public_client($1, $2, $3, $4, $5, $6)', [
    ORG, country, name, email, phone, doc,
  ])
  return rows[0]
}

beforeAll(async () => {
  db = new PGlite()
  // The minimum the scripts touch. Supabase has these roles and far more tables.
  await db.exec(`
    create role anon; create role authenticated;
    create table reservations (id uuid primary key default gen_random_uuid());
    create table clients (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null, business_id uuid, name text not null,
      email text, phone text, document_number text, document_type text,
      is_active boolean default true, is_walk_in boolean default false,
      created_at timestamptz not null default now()
    );
  `)
  // ONLY the phone function of script 044 (that file also defines an old
  // create_public_reservation, which must not be loaded here).
  const s044 = read('044-country-aware-phone-matching.sql')
  const from = s044.indexOf('create or replace function public.normalize_phone_for_matching')
  const to = s044.indexOf('revoke all on function public.normalize_phone_for_matching')
  await db.exec(s044.slice(from, to))
  await db.exec(read('124-client-matching-v1.sql'))
})

describe('scripts/124', () => {
  it('is valid SQL, including the patched create_public_reservation', async () => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_proc where proname = 'create_public_reservation'`
    )
    expect(rows[0].n).toBe(1)
  })

  it('can be run twice', async () => {
    await expect(db.exec(read('124-client-matching-v1.sql'))).resolves.toBeDefined()
  })

  it('the rollback is valid SQL, and 124 can be applied again after it', async () => {
    await expect(db.exec(read('124-rollback.sql'))).resolves.toBeDefined()
    await expect(db.exec(read('124-client-matching-v1.sql'))).resolves.toBeDefined()
  })

  it('keeps the internal matcher away from the public', async () => {
    const { rows } = await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.find_public_client(uuid,text,text,text,text,text)', 'execute') as ok`
    )
    expect(rows[0].ok).toBe(false)
  })
})

describe('name rule: SQL equals TypeScript', () => {
  const pairs: [string, string][] = [
    ['Juan Perez', 'juan perez'], ['Juan Pérez', 'Juan Perez'], ['Juan Perez', 'Juan Carlos Perez Garcia'],
    ['Juan Perez', 'Perez Juan'], ['Ana María Lopez', 'Maria Lopez'], ['Alex Torres', 'Alexander Torres'],
    ['Juan', 'Juan Perez'], ['Juan Perez', ''], ['', 'Juan Perez'], ['Juan Perez', 'Maria Lopez'],
    ['Maria Lopez', 'Pedro Lopez'], ['Juan Perez', 'Pedro Perez'], ['Carlos Ramos', 'Luis Quispe'],
    ['Al Torres', 'Alberto Diaz'], ['J. Pérez', 'Juan Perez'], ['MARÍA-JOSÉ de la CRUZ', 'maria jose cruz'],
    ['Ñandú Reyes', 'Nandu Reyes'], ['Mc Donald', 'Donald Mc'],
  ]
  it.each(pairs)('%s ~ %s', async (a, b) => {
    const { rows } = await db.query<{ ok: boolean }>('select public.client_names_compatible($1, $2) as ok', [a, b])
    expect(rows[0].ok).toBe(namesCompatible(a, b))
  })
})

describe('find_public_client', () => {
  let juan: string
  let maria: string
  let juan2: string

  beforeAll(async () => {
    juan = await addClient('Juan Perez', 'juan@mail.com', '+51 999 888 777', '12345678', { created: '2026-01-01' })
    maria = await addClient('Maria Lopez', 'fam@mail.com', '987654321', null, { created: '2026-02-01' })
    juan2 = await addClient('Juan Perez', 'otro@mail.com', '911111111', null, { created: '2026-03-01' })
    await db.query(`insert into clients (organization_id, name, is_walk_in) values ($1, 'Cliente de paso', true)`, [ORG])
  })

  it('matches an email ignoring case and spaces', async () => {
    expect(await find('Juan Perez', 'JUAN@mail.com ', null, null)).toMatchObject({ client_id: juan, reason: 'email' })
  })

  it('matches a stored "+51 999 888 777" typed with 9 bare digits or with the country code', async () => {
    expect(await find('Juan Perez', null, '999888777', null)).toMatchObject({ client_id: juan, reason: 'phone' })
    expect(await find('Juan Perez', null, '51-999-888-777', null)).toMatchObject({ client_id: juan, reason: 'phone' })
  })

  it('a shared phone with a different person creates a NEW client, flagged', async () => {
    expect(await find('Pedro Lopez', null, '987654321', null)).toMatchObject({
      client_id: null, reason: 'new:name_mismatch',
    })
  })

  it('a shared phone with the same person (longer name) finds the existing client', async () => {
    expect(await find('Maria Lopez Diaz', null, '987654321', null)).toMatchObject({ client_id: maria, reason: 'phone' })
  })

  it('a shared email with a different person creates a NEW client', async () => {
    expect(await find('Pedro Lopez', 'fam@mail.com', null, null)).toMatchObject({
      client_id: null, reason: 'new:name_mismatch',
    })
  })

  it('email beats phone: the second Juan Perez is found by his own email', async () => {
    expect(await find('Juan Perez', 'otro@mail.com', '999888777', null)).toMatchObject({
      client_id: juan2, reason: 'email',
    })
  })

  it('a document matches, but typed under another name it is NOT copied to the new client', async () => {
    expect(await find('Juan Perez', null, null, '12345678')).toMatchObject({ client_id: juan, reason: 'document' })
    expect(await find('Pedro Quispe', null, null, '12345678')).toMatchObject({ client_id: null, skip_document: true })
  })

  it('a brand new person, and an empty form, are simply new', async () => {
    expect(await find('Luis Ramos', 'nuevo@mail.com', '955555555', '87654321')).toMatchObject({
      client_id: null, reason: 'new', skip_document: false,
    })
    expect(await find('Cliente nuevo', null, null, null)).toMatchObject({ client_id: null, reason: 'new' })
  })

  it('never matches the walk-in client', async () => {
    expect((await find('Cliente de paso', null, null, null)).client_id).toBeNull()
  })

  it('with duplicates, always picks the oldest ACTIVE one; inactive only as a last resort', async () => {
    const d1 = await addClient('Rosa Diaz', null, '933333333', null, { created: '2026-05-01' })
    const d2 = await addClient('Rosa Diaz', null, '933333333', null, { created: '2026-04-01' })
    const d3 = await addClient('Rosa Diaz', null, '933333333', null, { created: '2026-01-01', active: false })
    for (let i = 0; i < 3; i++) expect((await find('Rosa Diaz', null, '933333333', null)).client_id).toBe(d2)
    await db.query('update clients set is_active = false where id in ($1, $2)', [d1, d2])
    expect((await find('Rosa Diaz', null, '933333333', null)).client_id).toBe(d3)
  })

  it('US: 10 digits match a formatted number', async () => {
    const us = await addClient('Mike Ross', null, '(212) 555-0100', null)
    expect((await find('Mike Ross', null, '2125550100', null, 'US')).client_id).toBe(us)
  })
})
