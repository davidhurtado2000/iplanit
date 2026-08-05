-- Migrates the binary free/premium plan system to three tiers:
-- Free ($0) / Pro ($25/mo) / Premium ($40/mo, was $35 - existing $35
-- subscribers keep their price until they change plans, see
-- app/api/webhooks/stripe/route.ts).
--
-- Also fixes a standing bug: is_business_accessible(), add_business_staff()
-- and business_member_role() (scripts 024/027/032) all check
-- businesses.plan, a column NOTHING has ever written to (stays 'free'
-- forever) - so staff/team access for any real paying customer has always
-- been broken. This switches all three to the owner's profiles.plan,
-- resolved through the new get_business_plan() helper below, matching the
-- pattern is_business_premium() already established.

-- 1. Widen the CHECK constraint. profiles_plan_check is the default
-- Postgres-assigned name for the unnamed inline check in
-- scripts/001-create-profiles.sql - verify with:
--   select conname from pg_constraint where conrelid = 'public.profiles'::regclass and contype = 'c';
-- before running, in case it was ever renamed.
alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles
  add constraint profiles_plan_check check (plan in ('free', 'pro', 'premium'));

-- businesses.plan is intentionally NOT touched here - it stays
-- ('free','premium') only. It remains a dead column nothing writes to;
-- widening its constraint or its TS type would incorrectly imply it's
-- still meaningful. All access checks below resolve plan via the owner's
-- profiles.plan instead.

-- 2. Single source of truth for "what plan is this business actually on":
-- resolved through owner_id -> profiles.plan, same lookup
-- is_business_premium() already used (script 048), now generalized to all
-- three tiers and reused everywhere plan needs to be resolved.
create or replace function public.get_business_plan(target_business_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select p.plan
  from public.businesses b
  join public.profiles p on p.id = b.owner_id
  where b.id = target_business_id;
$$;

create or replace function public.is_business_premium(target_business_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.get_business_plan(target_business_id) = 'premium';
$$;

-- True for Pro OR Premium - used wherever a cap disappears entirely once
-- the account is on ANY paid plan (reservations/clients bypass, and now
-- team/staff access, which Pro also includes).
create or replace function public.is_business_paid(target_business_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.get_business_plan(target_business_id) in ('pro', 'premium');
$$;

-- 3. Reservations / Clients: unlimited on Pro AND Premium now (only Free
-- is capped) - bypass condition widens from is_business_premium to
-- is_business_paid, cap values (50 / 20) unchanged.
create or replace function public.check_reservation_limit()
returns trigger as $$
declare
  v_count int;
begin
  if public.is_business_paid(new.business_id) then
    return new;
  end if;

  select count(*) into v_count
  from public.reservations
  where business_id = new.business_id
    and created_at >= date_trunc('month', now());

  if v_count >= 50 then
    raise exception 'free_plan_reservation_limit' using errcode = 'PLN01';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.check_client_limit()
returns trigger as $$
declare
  v_count int;
begin
  if public.is_business_paid(new.business_id) then
    return new;
  end if;

  select count(*) into v_count from public.clients where business_id = new.business_id;

  if v_count >= 20 then
    raise exception 'free_plan_client_limit' using errcode = 'PLN02';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 4. Services / Resources: real 3-way branch now - free=3/2, pro=5/5,
-- premium=unlimited. Resource trigger's parking exemption (type <>
-- 'parking' never capped) is unchanged.
create or replace function public.check_service_limit()
returns trigger as $$
declare
  v_plan text;
  v_limit int;
  v_count int;
begin
  v_plan := public.get_business_plan(new.business_id);

  if v_plan = 'premium' then
    return new;
  end if;

  v_limit := case when v_plan = 'pro' then 5 else 3 end;

  select count(*) into v_count from public.services where business_id = new.business_id;

  if v_count >= v_limit then
    raise exception 'free_plan_service_limit' using errcode = 'PLN03';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.check_resource_limit()
returns trigger as $$
declare
  v_plan text;
  v_limit int;
  v_count int;
begin
  if new.type = 'parking' then
    return new;
  end if;

  v_plan := public.get_business_plan(new.business_id);

  if v_plan = 'premium' then
    return new;
  end if;

  v_limit := case when v_plan = 'pro' then 5 else 2 end;

  select count(*) into v_count
  from public.resources
  where business_id = new.business_id and type <> 'parking';

  if v_count >= v_limit then
    raise exception 'free_plan_resource_limit' using errcode = 'PLN04';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Triggers themselves are unchanged (CREATE OR REPLACE FUNCTION above is
-- enough) - no need to re-run drop/create trigger, function bodies just
-- got swapped under the same trigger names.

-- 5. get_plan_usage: now also returns the resolved plan tier and team seat
-- count, so lib/plan-limits.ts can become tier-aware without a second
-- fetch, and so the check is correct for a staff caller too (their own
-- profiles.plan isn't the business's plan - this RPC resolves the
-- business's actual plan via the owner regardless of who's asking).
create or replace function public.get_plan_usage(p_business_id uuid)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_business_accessible(p_business_id) then
    return json_build_object('error', 'not_accessible');
  end if;

  return json_build_object(
    'plan', public.get_business_plan(p_business_id),
    'reservations_this_month', (
      select count(*) from public.reservations
      where business_id = p_business_id and created_at >= date_trunc('month', now())
    ),
    'clients', (select count(*) from public.clients where business_id = p_business_id),
    'services', (select count(*) from public.services where business_id = p_business_id),
    'resources', (
      select count(*) from public.resources
      where business_id = p_business_id and type <> 'parking'
    ),
    'team_seats', (select count(*) from public.business_members where business_id = p_business_id)
  );
end;
$$;

-- 6. Finding-A fix: is_business_accessible switches from the dead
-- businesses.plan to is_business_paid() (Pro or Premium both grant staff
-- access now, since Pro includes team seats).
create or replace function public.is_business_accessible(target_business_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = target_business_id
    and (
      b.owner_id = auth.uid()
      or (
        public.is_business_paid(b.id)
        and exists (
          select 1 from public.business_members bm
          where bm.business_id = b.id and bm.user_id = auth.uid()
        )
      )
    )
  );
$$;

-- business_member_role: same fix, same dead-column swap.
create or replace function public.business_member_role(target_business_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.businesses where id = target_business_id and owner_id = auth.uid()
    ) then 'owner'
    else (
      select bm.role
      from public.business_members bm
      where bm.business_id = target_business_id
        and bm.user_id = auth.uid()
        and public.is_business_paid(target_business_id)
      limit 1
    )
  end;
$$;

-- add_business_staff: dead-column fix + Pro's 2-seat cap. Error code
-- renamed 'not_premium' -> 'plan_required' (frontend mapping updated in
-- app/(dashboard)/dashboard/settings/page.tsx to match) since it's no
-- longer specifically about Premium. New 'seat_limit_reached' error for
-- the Pro cap - only counted against when the target is a genuinely NEW
-- member; re-inviting an existing member to change their role must not be
-- blocked by the cap.
create or replace function public.add_business_staff(p_business_id uuid, p_email text, p_role text default 'admin')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_plan text;
  v_target_id uuid;
  v_target_name text;
  v_seat_count int;
begin
  if p_role not in ('admin', 'sales') then
    return json_build_object('error', 'invalid_role');
  end if;

  select owner_id into v_owner_id from public.businesses where id = p_business_id;

  if v_owner_id is null then
    return json_build_object('error', 'business_not_found');
  end if;

  if v_owner_id <> auth.uid() then
    return json_build_object('error', 'not_owner');
  end if;

  v_plan := public.get_business_plan(p_business_id);

  if v_plan = 'free' then
    return json_build_object('error', 'plan_required');
  end if;

  select id, full_name into v_target_id, v_target_name
  from public.profiles where lower(email) = lower(trim(p_email));

  if v_target_id is null then
    return json_build_object('error', 'user_not_found');
  end if;

  if v_target_id = v_owner_id then
    return json_build_object('error', 'is_owner');
  end if;

  if v_plan = 'pro' and not exists (
    select 1 from public.business_members
    where business_id = p_business_id and user_id = v_target_id
  ) then
    select count(*) into v_seat_count from public.business_members where business_id = p_business_id;
    if v_seat_count >= 2 then
      return json_build_object('error', 'seat_limit_reached');
    end if;
  end if;

  insert into public.business_members (business_id, user_id, email, full_name, role)
  values (p_business_id, v_target_id, lower(trim(p_email)), v_target_name, p_role)
  on conflict (business_id, user_id) do update set role = excluded.role, full_name = excluded.full_name;

  return json_build_object('success', true, 'name', v_target_name, 'email', p_email, 'role', p_role);
end;
$$;

-- create_public_reservation (script 045) needs no changes - it still
-- catches sqlstate 'PLN01' from check_reservation_limit, which only ever
-- fires for genuinely free-tier businesses now (pro/premium bypass before
-- the count check runs), so its existing error mapping stays correct.
