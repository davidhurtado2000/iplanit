-- AI add-on: $7/mes, cobro real vía Stripe (segundo item en la misma
-- suscripción de Pro/Premium), medido con un tope combinado de 300 usos/mes
-- (resúmenes + chat). Ver la conversación para el análisis de costos que
-- respalda ese número - garantiza ganancia real incluso en el peor caso con
-- cualquiera de los dos modelos de IA en uso.

alter table public.profiles
  add column if not exists ai_addon_active boolean not null default false;

-- Override manual, nunca tocado por el webhook de Stripe (que solo escribe
-- ai_addon_active) - pensado para habilitar una cuenta puntual (ej. la
-- propia de David) sin pasar por un cobro real, para probar en la cuenta/
-- dominio real. Se activa a mano en la base de datos, no hay UI para esto -
-- mismo criterio que is_platform_admin (scripts/065-blog.sql).
alter table public.profiles
  add column if not exists ai_addon_override boolean not null default false;

-- Reemplaza ai_summary_log (scripts/074) y ai_chat_log (scripts/075) - un
-- solo registro de uso combinado para poder medir el tope mensual de 300
-- sin tener que sumar dos tablas. Mismo patrón de RLS que las que reemplaza.
drop table if exists public.ai_summary_log;
drop table if exists public.ai_chat_log;

create table if not exists public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  type text not null check (type in ('summary', 'chat')),
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_log_lookup_idx
  on public.ai_usage_log(business_id, created_at);

alter table public.ai_usage_log enable row level security;

create policy "Service role can manage ai usage log"
  on public.ai_usage_log for all
  using (auth.role() = 'service_role');
