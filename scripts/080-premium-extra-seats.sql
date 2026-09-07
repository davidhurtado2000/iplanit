-- Premium stops being unconditionally "unlimited" on team seats - David's
-- call after realizing advertising true infinity risks a trust problem if a
-- large customer later relies on it and it has to be walked back. New
-- model: Premium includes 5 seats, shared across every sede an owner runs
-- (organization-wide, not 5 per sede - otherwise a 5-sede Premium account
-- would get 25 free seats, defeating the point of monetizing large
-- customers), and each seat beyond that costs $10/month as a quantity-based
-- Stripe line item (see lib/stripe.ts getSeatItem, app/api/stripe/extra-
-- seats). Pro is unchanged: hard cap of 2, no purchase path.
--
-- A seat = a distinct PERSON (user_id), so someone staffed on 2 of the
-- owner's sedes still only counts once - this unifies with how `clients`
-- already counts (scripts/053-organizations-and-sedes.sql switched that
-- from business_id to organization_id for the same multi-sede reason).

alter table public.profiles
  add column if not exists extra_seats_purchased int not null default 0
  check (extra_seats_purchased >= 0);

comment on column public.profiles.extra_seats_purchased is
  'Reconciled by the Stripe webhook from the seat add-on item''s quantity (see lib/stripe.ts getSeatItem, app/api/webhooks/stripe). Owner-scoped, only meaningful on the profile holding stripe_subscription_id - analogous to ai_addon_active.';

-- get_plan_usage: team_seats switches to an organization-wide count of
-- distinct people, same formula for every plan (Pro can only ever have 1
-- sede, so this is identical to the old per-business count there - no
-- plan-conditional branching needed). Also surfaces extra_seats_purchased
-- for the UI's "N included + M extra" display.
create or replace function public.get_plan_usage(p_business_id uuid)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_owner record;
begin
  if not public.is_business_accessible(p_business_id) then
    return json_build_object('error', 'not_accessible');
  end if;

  select organization_id into v_organization_id from public.businesses where id = p_business_id;

  select p.plan, p.ai_addon_active, p.ai_addon_override, p.ai_addon_access_until, p.extra_seats_purchased
    into v_owner
    from public.businesses b
    join public.profiles p on p.id = b.owner_id
    where b.id = p_business_id;

  return json_build_object(
    'plan', v_owner.plan,
    'ai_addon_active', v_owner.ai_addon_active,
    'ai_addon_override', v_owner.ai_addon_override,
    'ai_addon_access_until', v_owner.ai_addon_access_until,
    'extra_seats_purchased', v_owner.extra_seats_purchased,
    'reservations_this_month', (
      select count(*) from public.reservations
      where business_id = p_business_id and created_at >= date_trunc('month', now())
    ),
    'clients', (select count(*) from public.clients where organization_id = v_organization_id),
    'services', (select count(*) from public.services where business_id = p_business_id),
    'resources', (
      select count(*) from public.resources
      where business_id = p_business_id and type <> 'parking'
    ),
    'team_seats', (
      select count(distinct bm.user_id) from public.business_members bm
      join public.businesses b on b.id = bm.business_id
      where b.organization_id = v_organization_id
    )
  );
end;
$$;

-- add_business_staff: Premium branch parallel to the existing Pro one,
-- capped at 5 + extra_seats_purchased, same org-wide distinct-person count
-- as above (only counted against when the target is a genuinely NEW
-- person to the org - re-inviting an existing member, or adding an
-- existing member to one more sede, must not be blocked by the cap).
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
