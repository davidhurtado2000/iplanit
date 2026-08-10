-- Owner-facing traceability log: who on the team created/edited/deleted a
-- service, client, resource, business setting, or staff member. Separate
-- on purpose from public.notifications (scripts/055) - that one is about
-- reservation EVENTS every teammate should see (new booking, client
-- cancelled); this one is about STAFF ACTIONS only the owner should see,
-- an accountability trail rather than a "catch me up" feed. Deliberately
-- scoped to admin-surface entities (services/clients/resources/business
-- config/team) and NOT reservations - reservations already have full
-- visibility via the calendar itself and the notifications feed, so logging
-- every booking here would just be noise at 10x the volume for no new
-- information.
--
-- Written entirely via triggers, never an app-level call at each mutation
-- site, same reasoning as scripts/055: guaranteed coverage regardless of
-- which page/flow performs the write, nothing for a future call site to
-- forget. business_hours gets a STATEMENT-level trigger (not per-row) since
-- Configuracion > Horario upserts up to 7 rows in one save - a per-row
-- trigger would log 7 near-duplicate entries for a single click.

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  -- Kept even if the acting user later loses access/is removed as staff -
  -- on delete set null (not cascade) so the row, and the actor_name
  -- snapshot below, survive as history.
  user_id uuid references auth.users(id) on delete set null,
  -- Snapshot of the actor's display name at write time - the log stays
  -- readable ("David eliminó...") even after that person is removed from
  -- the team, the same reasoning as entity_label below.
  actor_name text not null,
  action text not null check (action in ('created', 'updated', 'deleted')),
  entity_type text not null check (entity_type in ('service', 'client', 'resource', 'business', 'business_hours', 'staff')),
  -- Snapshot of the entity's name at write time (not a live join) so a
  -- since-deleted service/client/etc. still reads clearly in the log.
  entity_label text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists activity_log_business_id_created_at_idx
  on public.activity_log(business_id, created_at desc);

alter table public.activity_log enable row level security;

-- Owner-only, unlike notifications (which every teammate can see) - this is
-- specifically an oversight tool for watching what the team did, so an
-- admin/sales teammate seeing "who's watching them" would defeat the point.
drop policy if exists "Owner can view activity log" on public.activity_log;
create policy "Owner can view activity log"
  on public.activity_log for select
  using (exists (select 1 from public.businesses where id = business_id and owner_id = auth.uid()));

drop policy if exists "Service role can manage activity log" on public.activity_log;
create policy "Service role can manage activity log"
  on public.activity_log for all
  using (auth.role() = 'service_role');

-- Shared insert helper for every trigger below - resolves the actor's name
-- once, in one place, instead of repeating the profiles lookup per trigger.
create or replace function public._log_activity(
  p_business_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_label text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
begin
  select coalesce(nullif(full_name, ''), email) into v_actor_name
  from public.profiles where id = auth.uid();

  insert into public.activity_log (business_id, user_id, actor_name, action, entity_type, entity_label)
  values (p_business_id, auth.uid(), coalesce(v_actor_name, 'Usuario'), p_action, p_entity_type, coalesce(p_entity_label, ''));
end;
$$;

-- Services -------------------------------------------------------------

create or replace function public.log_service_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null for service-role/background writes (none exist on
  -- this table today, but this keeps the log free of misleading "someone
  -- did X" rows if one is ever added) - only real authenticated actions
  -- belong in an accountability trail.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if TG_OP = 'INSERT' then
    perform public._log_activity(new.business_id, 'created', 'service', new.name);
  elsif TG_OP = 'UPDATE' then
    perform public._log_activity(new.business_id, 'updated', 'service', new.name);
  elsif TG_OP = 'DELETE' then
    perform public._log_activity(old.business_id, 'deleted', 'service', old.name);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists services_log_activity on public.services;
create trigger services_log_activity
  after insert or update or delete on public.services
  for each row execute function public.log_service_activity();

-- Clients ----------------------------------------------------------------

create or replace function public.log_client_activity()
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
    perform public._log_activity(new.business_id, 'created', 'client', new.name);
  elsif TG_OP = 'UPDATE' then
    perform public._log_activity(new.business_id, 'updated', 'client', new.name);
  elsif TG_OP = 'DELETE' then
    perform public._log_activity(old.business_id, 'deleted', 'client', old.name);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists clients_log_activity on public.clients;
create trigger clients_log_activity
  after insert or update or delete on public.clients
  for each row execute function public.log_client_activity();

-- Resources ----------------------------------------------------------------

create or replace function public.log_resource_activity()
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
    perform public._log_activity(new.business_id, 'created', 'resource', new.name);
  elsif TG_OP = 'UPDATE' then
    perform public._log_activity(new.business_id, 'updated', 'resource', new.name);
  elsif TG_OP = 'DELETE' then
    perform public._log_activity(old.business_id, 'deleted', 'resource', old.name);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists resources_log_activity on public.resources;
create trigger resources_log_activity
  after insert or update or delete on public.resources
  for each row execute function public.log_resource_activity();

-- Business settings (Configuracion > Negocio / Notificaciones) -----------

create or replace function public.log_business_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  perform public._log_activity(new.id, 'updated', 'business', new.name);
  return new;
end;
$$;

drop trigger if exists businesses_log_activity on public.businesses;
create trigger businesses_log_activity
  after update on public.businesses
  for each row execute function public.log_business_activity();

-- Business hours (Configuracion > Horario) - statement-level so a single
-- "Guardar horario" click (an upsert of up to 7 day rows) produces exactly
-- one log entry instead of up to 7.

create or replace function public.log_business_hours_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_business_name text;
begin
  if auth.uid() is null then
    return null;
  end if;
  select business_id into v_business_id from new_rows limit 1;
  if v_business_id is null then
    return null;
  end if;
  select name into v_business_name from public.businesses where id = v_business_id;
  perform public._log_activity(v_business_id, 'updated', 'business_hours', coalesce(v_business_name, ''));
  return null;
end;
$$;

-- Postgres doesn't allow a transition table on a trigger covering more than
-- one event, so this is split into two single-event triggers (both calling
-- the same function) instead of one "insert or update" trigger.
drop trigger if exists business_hours_log_activity on public.business_hours;
drop trigger if exists business_hours_log_activity_insert on public.business_hours;
create trigger business_hours_log_activity_insert
  after insert on public.business_hours
  referencing new table as new_rows
  for each statement execute function public.log_business_hours_activity();

drop trigger if exists business_hours_log_activity_update on public.business_hours;
create trigger business_hours_log_activity_update
  after update on public.business_hours
  referencing new table as new_rows
  for each statement execute function public.log_business_hours_activity();

-- Staff (Configuracion > Equipo - business_members, scripts/024/032) ------

create or replace function public.log_staff_activity()
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
    perform public._log_activity(new.business_id, 'created', 'staff', coalesce(nullif(new.full_name, ''), new.email));
  elsif TG_OP = 'UPDATE' then
    perform public._log_activity(new.business_id, 'updated', 'staff', coalesce(nullif(new.full_name, ''), new.email));
  elsif TG_OP = 'DELETE' then
    perform public._log_activity(old.business_id, 'deleted', 'staff', coalesce(nullif(old.full_name, ''), old.email));
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists business_members_log_activity on public.business_members;
create trigger business_members_log_activity
  after insert or update or delete on public.business_members
  for each row execute function public.log_staff_activity();
