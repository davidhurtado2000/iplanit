-- Workers: who actually performs a service - deliberately a SEPARATE
-- concept from Resources (David's own words: "quiero separar el trabajador
-- del recurso porque ya no son directamente relacionados"). A resource is a
-- bookable thing (a room, a piece of equipment, a generic "person" slot); a
-- worker is a person doing the work. A dental office might book "Consultorio
-- 2" as the resource and "Dr. Smith" as the worker on the same reservation -
-- two independent dimensions, not one merged picker. Also deliberately
-- separate from business_members (Configuracion > Equipo, scripts/024/032):
-- that's about who can LOG INTO the dashboard; a worker never needs an
-- account at all (the coworking receptionist who books appointments FOR
-- three doctors is a common case - the doctors are workers, only the
-- receptionist needs a login).
--
-- Scope for v1 (matches services/resources' own access boundary from
-- script 032): owner/admin manage the roster, schedule and service
-- assignments; sales can read (needed to pick a worker on a reservation)
-- but not write. Worker assignment happens inside the dashboard only - the
-- public booking page does not let a client pick a worker (that's "who's
-- in charge" being the business's call, not the client's, per how this was
-- asked for).

create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  color text not null default '#3B82F6',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workers_business_id_idx on public.workers(business_id);

alter table public.workers enable row level security;

drop policy if exists "Users can view workers of their business" on public.workers;
create policy "Users can view workers of their business"
  on public.workers for select
  using (public.is_business_accessible(business_id));

drop policy if exists "Owner/admin can insert workers" on public.workers;
create policy "Owner/admin can insert workers"
  on public.workers for insert
  with check (public.business_member_role(business_id) in ('owner', 'admin'));

drop policy if exists "Owner/admin can update workers" on public.workers;
create policy "Owner/admin can update workers"
  on public.workers for update
  using (public.business_member_role(business_id) in ('owner', 'admin'));

drop policy if exists "Owner/admin can delete workers" on public.workers;
create policy "Owner/admin can delete workers"
  on public.workers for delete
  using (public.business_member_role(business_id) in ('owner', 'admin'));

drop policy if exists "Service role can manage workers" on public.workers;
create policy "Service role can manage workers"
  on public.workers for all
  using (auth.role() = 'service_role');

-- Worker's own work schedule - no rows means "follows business_hours", same
-- convention business_hours itself uses for missing days. Owner/admin write
-- (not owner-only like business_hours itself) since a worker's schedule is
-- operational data about that worker, same trust level as the worker's own
-- name/color, not a Configuracion-level business policy.
create table if not exists public.worker_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  open_time time not null,
  close_time time not null,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(worker_id, day_of_week)
);

create index if not exists worker_hours_worker_id_idx on public.worker_hours(worker_id);
create index if not exists worker_hours_business_id_idx on public.worker_hours(business_id);

alter table public.worker_hours enable row level security;

drop policy if exists "Users can view worker hours of their business" on public.worker_hours;
create policy "Users can view worker hours of their business"
  on public.worker_hours for select
  using (public.is_business_accessible(business_id));

drop policy if exists "Owner/admin can insert worker hours" on public.worker_hours;
create policy "Owner/admin can insert worker hours"
  on public.worker_hours for insert
  with check (public.business_member_role(business_id) in ('owner', 'admin'));

drop policy if exists "Owner/admin can update worker hours" on public.worker_hours;
create policy "Owner/admin can update worker hours"
  on public.worker_hours for update
  using (public.business_member_role(business_id) in ('owner', 'admin'));

drop policy if exists "Owner/admin can delete worker hours" on public.worker_hours;
create policy "Owner/admin can delete worker hours"
  on public.worker_hours for delete
  using (public.business_member_role(business_id) in ('owner', 'admin'));

drop policy if exists "Service role can manage worker hours" on public.worker_hours;
create policy "Service role can manage worker hours"
  on public.worker_hours for all
  using (auth.role() = 'service_role');

-- Junction: which services a worker is assigned to perform - same
-- shape/purpose as service_resources (scripts/008/032), just for the
-- worker dimension.
create table if not exists public.worker_services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(worker_id, service_id)
);

create index if not exists worker_services_worker_id_idx on public.worker_services(worker_id);
create index if not exists worker_services_service_id_idx on public.worker_services(service_id);

alter table public.worker_services enable row level security;

drop policy if exists "Users can view worker_services of their business" on public.worker_services;
create policy "Users can view worker_services of their business"
  on public.worker_services for select
  using (public.is_business_accessible(business_id));

drop policy if exists "Owner/admin can insert worker_services" on public.worker_services;
create policy "Owner/admin can insert worker_services"
  on public.worker_services for insert
  with check (public.business_member_role(business_id) in ('owner', 'admin'));

drop policy if exists "Owner/admin can delete worker_services" on public.worker_services;
create policy "Owner/admin can delete worker_services"
  on public.worker_services for delete
  using (public.business_member_role(business_id) in ('owner', 'admin'));

drop policy if exists "Service role can manage worker_services" on public.worker_services;
create policy "Service role can manage worker_services"
  on public.worker_services for all
  using (auth.role() = 'service_role');

-- A reservation can have a resource, a worker, both, or neither - no
-- exclusion constraint is added for worker_id (unlike resource_id's
-- scripts/012/035) since double-booking prevention for workers is handled
-- client-side only for v1 (see reservation-modal.tsx's pre-flight check) -
-- a real but rare race-condition gap, same tradeoff already accepted
-- elsewhere for anything without a DB-level exclusion constraint.
alter table public.reservations
  add column if not exists worker_id uuid references public.workers(id) on delete set null;

create index if not exists reservations_worker_id_idx on public.reservations(worker_id);

alter table public.reservation_series
  add column if not exists worker_id uuid references public.workers(id) on delete set null;

-- Activity log (scripts/056) - 'worker' is a new entity_type, distinct from
-- the existing 'staff' (which means business_members / login accounts,
-- scripts/024/032 - a different concept, see the comment at the top of this
-- file). Postgres has no "ADD CONSTRAINT IF NOT EXISTS" for CHECK, so
-- drop-then-add, same pattern scripts/032/055 already use for a re-run.
alter table public.activity_log drop constraint if exists activity_log_entity_type_check;
alter table public.activity_log add constraint activity_log_entity_type_check
  check (entity_type in ('service', 'client', 'resource', 'business', 'business_hours', 'staff', 'worker'));

create or replace function public.log_worker_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if TG_OP = 'INSERT' then
    perform public._log_activity(new.business_id, 'created', 'worker', new.name);
  elsif TG_OP = 'UPDATE' then
    perform public._log_activity(new.business_id, 'updated', 'worker', new.name);
  elsif TG_OP = 'DELETE' then
    perform public._log_activity(old.business_id, 'deleted', 'worker', old.name);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists workers_log_activity on public.workers;
create trigger workers_log_activity
  after insert or update or delete on public.workers
  for each row execute function public.log_worker_activity();

-- Statement-level for the same reason as business_hours_log_activity
-- (scripts/056/057-earlier): one "Guardar horario" click on a worker's
-- schedule upserts up to 7 day rows and should read as one entry.
create or replace function public.log_worker_hours_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id uuid;
  v_business_id uuid;
  v_worker_name text;
begin
  if auth.uid() is null then
    return null;
  end if;
  select worker_id, business_id into v_worker_id, v_business_id from new_rows limit 1;
  if v_worker_id is null then
    return null;
  end if;
  select name into v_worker_name from public.workers where id = v_worker_id;
  perform public._log_activity(v_business_id, 'updated', 'worker', coalesce(v_worker_name, ''));
  return null;
end;
$$;

-- Split into two single-event triggers (both calling the same function) -
-- Postgres doesn't allow a transition table on a trigger covering more than
-- one event, same fix as business_hours_log_activity in scripts/056.
drop trigger if exists worker_hours_log_activity on public.worker_hours;
drop trigger if exists worker_hours_log_activity_insert on public.worker_hours;
create trigger worker_hours_log_activity_insert
  after insert on public.worker_hours
  referencing new table as new_rows
  for each statement execute function public.log_worker_hours_activity();

drop trigger if exists worker_hours_log_activity_update on public.worker_hours;
create trigger worker_hours_log_activity_update
  after update on public.worker_hours
  referencing new table as new_rows
  for each statement execute function public.log_worker_hours_activity();

-- Same statement-level reasoning: saving a worker's service checklist
-- inserts/deletes several worker_services rows in one action - one log
-- entry per save, not one per checkbox.
create or replace function public.log_worker_services_insert_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id uuid;
  v_business_id uuid;
  v_worker_name text;
begin
  if auth.uid() is null then
    return null;
  end if;
  select worker_id, business_id into v_worker_id, v_business_id from new_rows limit 1;
  if v_worker_id is null then
    return null;
  end if;
  select name into v_worker_name from public.workers where id = v_worker_id;
  perform public._log_activity(v_business_id, 'updated', 'worker', coalesce(v_worker_name, ''));
  return null;
end;
$$;

drop trigger if exists worker_services_log_activity on public.worker_services;
create trigger worker_services_log_activity
  after insert on public.worker_services
  referencing new table as new_rows
  for each statement execute function public.log_worker_services_insert_activity();
