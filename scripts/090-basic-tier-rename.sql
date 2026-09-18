-- Pricing overhaul, Phase 1: introduces 'basic' ($15/mo) as the new floor
-- tier, replacing the old free-forever plan. 'free' is NOT removed from the
-- allowed values - it's repurposed to mean "frozen: no active paid
-- subscription" (a lapsed/cancelled account, or - until Phase 4's
-- registration flow ships - a brand-new signup that hasn't picked a plan
-- yet). A frozen account can see its existing data but create nothing new
-- (reservations/clients/services/resources all capped at 0 below) - per
-- David's explicit call ("congelar la cuenta") over auto-downgrading to a
-- paid tier without asking.
--
-- New tier ladder (confirmed with David 2026-09-18):
--   basic ($15): 100 reservations/mo, unlimited clients/services, 5 resources
--   pro   ($25, unchanged price): 500 reservations/mo (its own real cap now,
--         NOT unlimited like the old 2-tier system), unlimited clients/
--         services, 10 resources, 2 team seats
--   premium ($40, unchanged price): unlimited everything, 5 team seats
--         (+$10/mo each extra, unchanged from scripts/080)
-- Clients: unlimited on every real tier now (David confirmed - not a lever
-- worth gating). Team seats: Basic gets none at all (same restriction the
-- old free tier had), Pro/Premium numbers are UNCHANGED from before this
-- migration.

-- 1. Widen the CHECK constraint - 'free' stays (repurposed as frozen),
-- 'basic' is new.
alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles
  add constraint profiles_plan_check check (plan in ('free', 'basic', 'pro', 'premium'));

-- 2. is_business_paid() is UNCHANGED (still 'pro'/'premium' only, not
-- widened to include 'basic') - it exclusively gates STAFF ACCESS
-- (is_business_accessible, business_member_role), and Basic can never
-- have staff at all (add_business_staff below blocks it same as frozen).
-- Keeping this narrow means an existing business_members row left over
-- from a Pro/Premium->Basic downgrade correctly loses access too, instead
-- of quietly keeping it just because 'basic' technically counts as paid
-- elsewhere. No redefinition needed - left as scripts/052 defined it.

-- 3. Reservations: only Premium is truly unlimited now - Pro has its own
-- real 500/mo cap (David's explicit number, NOT unlimited like the old
-- 2-tier system), Basic gets 100/mo, frozen ('free') gets 0 (blocked
-- entirely). Every real tier now needs its own cap value, so this can no
-- longer bypass via a blanket is_business_paid() check.
create or replace function public.check_reservation_limit()
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

  if v_plan = 'free' then
    raise exception 'free_plan_reservation_limit' using errcode = 'PLN01';
  end if;

  v_limit := case when v_plan = 'pro' then 500 else 100 end;

  select count(*) into v_count
  from public.reservations
  where business_id = new.business_id
    and created_at >= date_trunc('month', now());

  if v_count >= v_limit then
    raise exception 'free_plan_reservation_limit' using errcode = 'PLN01';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 4. Clients: unlimited on basic/pro/premium now (David's call - not worth
-- gating). Only frozen ('free') is blocked, unconditionally, from adding
-- any new client.
create or replace function public.check_client_limit()
returns trigger as $$
begin
  if new.organization_id is null then
    select organization_id into new.organization_id
    from public.businesses where id = new.business_id;
  end if;

  if public.get_business_plan(new.business_id) = 'free' then
    raise exception 'free_plan_client_limit' using errcode = 'PLN02';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 5. Services: unlimited on basic/pro/premium now too (David's call,
-- inspired by Fresha's model - resources are the real lever, not
-- services). Only frozen is blocked.
create or replace function public.check_service_limit()
returns trigger as $$
begin
  if public.get_business_plan(new.business_id) = 'free' then
    raise exception 'free_plan_service_limit' using errcode = 'PLN03';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 6. Resources: basic=5 (was free's 2), pro=10 (was 5), premium unlimited
-- (all unchanged in spirit, just basic/pro's numbers moved up). Frozen
-- blocked entirely. Parking resources get their own rule below instead of
-- the blanket "always exempt from the count" they had before - parking is
-- now Premium-only (David's call: small Basic/Pro businesses are unlikely
-- to have a parking lot; Premium implies bigger operations with multiple
-- sedes, more likely to need it), not just uncounted.
create or replace function public.check_resource_limit()
returns trigger as $$
declare
  v_plan text;
  v_limit int;
  v_count int;
begin
  v_plan := public.get_business_plan(new.business_id);

  if new.type = 'parking' then
    if v_plan <> 'premium' then
      raise exception 'premium_required_for_parking' using errcode = 'PLN05';
    end if;
    return new;
  end if;

  if v_plan = 'premium' then
    return new;
  end if;

  if v_plan = 'free' then
    raise exception 'free_plan_resource_limit' using errcode = 'PLN04';
  end if;

  v_limit := case when v_plan = 'pro' then 10 else 5 end;

  select count(*) into v_count
  from public.resources
  where business_id = new.business_id and type <> 'parking';

  if v_count >= v_limit then
    raise exception 'free_plan_resource_limit' using errcode = 'PLN04';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 7. add_business_staff: Basic joins frozen ('free') in being blocked from
-- ever adding a team member - David's call, matches the old free tier's
-- restriction exactly. Pro (2 seats) and Premium (5 + extra purchased)
-- branches below are copied unchanged from scripts/080.
create or replace function public.add_business_staff(p_business_id uuid, p_email text, p_role text default 'admin')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_organization_id uuid;
  v_plan text;
  v_target_id uuid;
  v_target_name text;
  v_seat_count int;
  v_extra_seats int;
begin
  if p_role not in ('admin', 'sales') then
    return json_build_object('error', 'invalid_role');
  end if;

  select owner_id, organization_id into v_owner_id, v_organization_id from public.businesses where id = p_business_id;

  if v_owner_id is null then
    return json_build_object('error', 'business_not_found');
  end if;

  if v_owner_id <> auth.uid() then
    return json_build_object('error', 'not_owner');
  end if;

  v_plan := public.get_business_plan(p_business_id);

  if v_plan in ('free', 'basic') then
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

  if v_plan = 'premium' and not exists (
    select 1 from public.business_members bm
    join public.businesses b on b.id = bm.business_id
    where b.organization_id = v_organization_id and bm.user_id = v_target_id
  ) then
    select extra_seats_purchased into v_extra_seats from public.profiles where id = v_owner_id;
    select count(distinct bm.user_id) into v_seat_count
      from public.business_members bm
      join public.businesses b on b.id = bm.business_id
      where b.organization_id = v_organization_id;
    if v_seat_count >= (5 + coalesce(v_extra_seats, 0)) then
      return json_build_object('error', 'seat_limit_reached');
    end if;
  end if;

  insert into public.business_members (business_id, user_id, email, full_name, role)
  values (p_business_id, v_target_id, lower(trim(p_email)), v_target_name, p_role)
  on conflict (business_id, user_id) do update set role = excluded.role, full_name = excluded.full_name;

  return json_build_object('success', true, 'name', v_target_name, 'email', p_email, 'role', p_role);
end;
$$;

-- create_public_reservation (script 045) needs no changes - it already
-- catches sqlstate 'PLN01' from check_reservation_limit generically and
-- maps it to 'business_reservation_limit_reached', which still fires
-- correctly for both frozen and basic-over-cap businesses.
