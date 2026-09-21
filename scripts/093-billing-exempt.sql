-- Pricing overhaul, Phase 5: a durable "this account never pays, full
-- Premium access" override - David's own accounts + his cofounder's.
--
-- Directly setting profiles.plan = 'premium' by hand (what was done
-- manually before this migration) is NOT durable: it looks fine until
-- ANYTHING touches Stripe for that profile again - a webhook event tied
-- to a stale/invalid stripe_subscription_id, a retried checkout, etc. -
-- at which point setPlanByCustomerId() (app/api/webhooks/stripe/route.ts)
-- overwrites plan back to 'free' the same way it would for a real
-- customer's real cancellation. Confirmed happening live 2026-09-21:
-- davidsoftwareservicesllc@gmail.com's manually-set 'pro' got silently
-- reset to 'free' this way while testing the new subscribe flow.
--
-- billing_exempt fixes this at the SOURCE instead: every place that
-- resolves "what plan does this business's owner actually have" now
-- checks billing_exempt first and reports 'premium' unconditionally when
-- true - the webhook can still overwrite the underlying `plan` column
-- freely (it doesn't know or care about this flag), but nothing downstream
-- ever sees anything but 'premium' for an exempt account regardless.
alter table public.profiles
  add column if not exists billing_exempt boolean not null default false;

comment on column public.profiles.billing_exempt is
  'Full Premium-level access forever, no real subscription required - manually granted (David''s own accounts / his cofounder), never touched by the Stripe webhook. See get_business_plan(), get_business_ai_addon_status(), get_plan_usage() - all resolve this before falling back to the real plan column.';

update public.profiles set billing_exempt = true
where email in (
  'david.huetado2000@gmail.com',
  'lopezh.stefani@gmail.com',
  'davidhurtadouni@gmail.com',
  'davidsoftwareservicesllc@gmail.com'
);

-- 1. get_business_plan(): the single resolver every DB trigger
-- (check_reservation_limit, check_client_limit, check_service_limit,
-- check_resource_limit, add_business_staff, is_business_paid,
-- is_business_premium) already goes through - fixing it here alone covers
-- all of those automatically, no other trigger function needs touching.
create or replace function public.get_business_plan(target_business_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case when p.billing_exempt then 'premium' else p.plan end
  from public.businesses b
  join public.profiles p on p.id = b.owner_id
  where b.id = target_business_id;
$$;

-- 2. get_business_ai_addon_status(): the RPC the FRONTEND actually reads
-- plan through almost everywhere (useBusinesses().aiAddonStatus.plan, fed
-- into meetsPlan() across the sidebar/dashboard/analytics/reservation-
-- modal/settings) - reads profiles.plan directly today, has to apply the
-- same override or the UI would still show a frozen/limited account even
-- though every DB-side check above already treats it as Premium.
create or replace function public.get_business_ai_addon_status(p_business_id uuid)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select case
    when not public.is_business_accessible(p_business_id) then json_build_object('error', 'not_accessible')
    else (
      select json_build_object(
        'plan', case when p.billing_exempt then 'premium' else p.plan end,
        'ai_addon_active', p.ai_addon_active,
        'ai_addon_override', p.ai_addon_override,
        'ai_addon_access_until', p.ai_addon_access_until
      )
      from public.businesses b
      join public.profiles p on p.id = b.owner_id
      where b.id = p_business_id
    )
  end;
$$;

-- 3. get_plan_usage(): the Settings > Plan tab / plan-usage-banner's own
-- resolver (latest prior definition: scripts/080-premium-extra-seats.sql) -
-- same fix, only the 'plan' field changes.
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

  select p.plan, p.billing_exempt, p.ai_addon_active, p.ai_addon_override, p.ai_addon_access_until, p.extra_seats_purchased
    into v_owner
    from public.businesses b
    join public.profiles p on p.id = b.owner_id
    where b.id = p_business_id;

  return json_build_object(
    'plan', case when v_owner.billing_exempt then 'premium' else v_owner.plan end,
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

-- 4. check_sede_limit(): can't go through get_business_plan() (it resolves
-- BY an existing business_id, but this fires on the NEW business row
-- before it has one) - same override logic, resolved by owner_id instead.
create or replace function public.check_sede_limit()
returns trigger as $$
declare
  v_existing_count int;
  v_owner_plan text;
begin
  select count(*) into v_existing_count
  from public.businesses
  where organization_id = new.organization_id;

  if v_existing_count = 0 then
    return new;
  end if;

  select case when billing_exempt then 'premium' else plan end into v_owner_plan
  from public.profiles where id = new.owner_id;

  if v_owner_plan is distinct from 'premium' then
    raise exception 'sede_requires_premium' using errcode = 'SDE01';
  end if;

  if v_existing_count >= 5 then
    raise exception 'sede_limit_reached' using errcode = 'SDE02';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;
