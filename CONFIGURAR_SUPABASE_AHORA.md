# CONFIGURAR SUPABASE - GUÍA SUPER SIMPLE

## El Problema
Las tablas en Supabase no existen aún. Necesitas crear las 7 tablas ejecutando scripts SQL.

## La Solución (5 minutos)

### PASO 1: Abre Supabase SQL Editor
1. Ve a tu proyecto Supabase: https://supabase.com/dashboard
2. Haz clic en **SQL Editor** (lado izquierdo)
3. Haz clic en **New Query**

### PASO 2: Copia el PRIMER Script
El primer script ya está aquí. Simplemente:
1. Copia TODO el código de abajo
2. Pégalo en Supabase SQL Editor
3. Haz clic en **RUN**
4. Espera a que diga "Success" (en verde)

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  avatar_url text,
  plan text default 'free' check (plan in ('free', 'premium')),
  timezone text default 'America/Lima',
  language text default 'es',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "Service role can manage profiles" on public.profiles;
create policy "Service role can manage profiles"
  on public.profiles for all
  using (auth.role() = 'service_role');

drop function if exists public.handle_new_user();
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, '');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

### PASO 3: Scripts 2-7
Ve a `/scripts/` carpeta y ejecuta en orden:
- `002-create-businesses.sql`
- `003-create-services.sql`
- `004-create-resources.sql`
- `005-create-clients.sql`
- `006-create-reservations.sql`
- `007-create-business-hours.sql`

Para cada uno: copia → pega en Supabase → clic RUN

### PASO 4: Verifica
En Supabase, ve a **Table Editor** y deberías ver 7 tablas:
- ✅ profiles
- ✅ businesses
- ✅ services
- ✅ resources
- ✅ clients
- ✅ reservations
- ✅ business_hours

### LISTO!
Ya puedes:
1. Volver a v0
2. Abrir Preview
3. Haz clic en "Registrarse"
4. Completa el formulario
5. ¡Entra al dashboard!

---

## Si algo falla:
- Verifica que copiaste TODO el script (desde `create table` hasta `;`)
- Revisa que pegaste en Supabase SQL Editor (no en otro lado)
- Si dice "already exists", eso está bien, significa que la tabla ya existe
- Si dice otro error, cópiame el mensaje exacto
