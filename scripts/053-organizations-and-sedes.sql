-- Adds multi-location ("sedes") support. Every business now belongs to an
-- organization (a lightweight owner-scoped grouping) - a single-sede
-- business is simply "an org of one". Reservations/services/resources/
-- hours/staff stay exactly as they are today (per-sede) - only clients
-- move to being recognized across every sede of the same org, so the same
-- person doesn't become a duplicate row per location.
--
-- Real trigger for this: the founder's co-founder runs a coworking
-- business with 2 physical locations. Clients likely use either location,
-- so a shared client base (and eventually consolidated analytics) matters
-- more than reservations/resources/services being unified, which are
-- genuinely different per physical location anyway.

-- ============================================================
-- 1. organizations table + RLS
-- ============================================================

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.organizations enable row level security;

drop policy if exists "Owner can view their own organization" on public.organizations;
create policy "Owner can view their own organization"
  on public.organizations for select
  using (auth.uid() = owner_id);

drop policy if exists "Owner can update their own organization" on public.organizations;
create policy "Owner can update their own organization"
  on public.organizations for update
  using (auth.uid() = owner_id);

-- Needed for the bootstrap path (app/(dashboard)/dashboard/settings/page.tsx's
-- handleCreateBusiness, used only when a signup completed with zero
-- businesses/organizations) to create its own organization client-side,
-- the same way handle_new_user() does server-side for the normal signup
-- flow. Scoped identically to the existing "insert their own business"
-- policy on businesses.
drop policy if exists "Owner can create their own organization" on public.organizations;
create policy "Owner can create their own organization"
  on public.organizations for insert
  with check (auth.uid() = owner_id);

drop policy if exists "Service role can manage organizations" on public.organizations;
create policy "Service role can manage organizations"
  on public.organizations for all
  using (auth.role() = 'service_role');

create index if not exists organizations_owner_id_idx on public.organizations(owner_id);

-- ============================================================
-- 2. businesses.organization_id (nullable -> backfill -> NOT NULL)
-- ============================================================

alter table public.businesses
  add column if not exists organization_id uuid references public.organizations(id);

-- One brand-new 1-business organization per EXISTING business row -
-- deliberately 1:1 even when an owner already has several pre-existing
-- businesses today (that already worked before this migration and stays
-- exactly as-is; merging pre-existing sibling businesses into one shared
-- org after the fact is out of scope). A loop, not a set-based insert, so
-- each new organization maps back to exactly the one business row it came
-- from.
do $$
declare
  v_business record;
  v_org_id uuid;
begin
  for v_business in
    select id, owner_id, name from public.businesses where organization_id is null
  loop
    insert into public.organizations (owner_id, name)
    values (v_business.owner_id, v_business.name)
    returning id into v_org_id;

    update public.businesses set organization_id = v_org_id where id = v_business.id;
  end loop;
end $$;

alter table public.businesses
  alter column organization_id set not null;

create index if not exists businesses_organization_id_idx on public.businesses(organization_id);

-- ============================================================
-- 3. Sede-limit trigger: the 1st business in a brand-new org is always
-- allowed (bootstraps signup + the backfill above); the 2nd+ requires the
-- owner's plan to be premium (resolved directly via profiles.plan, since
-- get_business_plan() needs an existing business row to look up from) and
-- caps at 5 businesses per org - no per-sede metered Stripe billing yet.
-- ============================================================

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

  select plan into v_owner_plan from public.profiles where id = new.owner_id;

  if v_owner_plan is distinct from 'premium' then
    raise exception 'sede_requires_premium' using errcode = 'SDE01';
  end if;

  if v_existing_count >= 5 then
    raise exception 'sede_limit_reached' using errcode = 'SDE02';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists enforce_sede_limit on public.businesses;
create trigger enforce_sede_limit
  before insert on public.businesses
  for each row execute function public.check_sede_limit();

-- ============================================================
-- 4. handle_new_user(): a brand-new signup's first business now also gets
-- its own brand-new organization, created and linked in the same
-- trigger/transaction.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_business_name text;
  v_business_type text;
  v_business_country text;
  v_currency text;
  v_timezone text;
  v_slug text;
  v_language text;
  v_organization_id uuid;
begin
  v_language := coalesce(nullif(trim(new.raw_user_meta_data->>'language'), ''), 'es');
  insert into public.profiles (id, email, full_name, language)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), v_language);

  v_business_name := nullif(trim(new.raw_user_meta_data->>'business_name'), '');
  if v_business_name is not null then
    v_business_type := nullif(trim(new.raw_user_meta_data->>'business_type'), '');
    v_business_country := coalesce(nullif(trim(new.raw_user_meta_data->>'business_country'), ''), 'PE');
    v_currency := case when v_business_country = 'US' then 'USD' else 'PEN' end;
    v_timezone := coalesce(new.raw_user_meta_data->>'timezone', 'America/Lima');
    v_slug := lower(regexp_replace(v_business_name, '\s+', '-', 'g')) || '-' || substr(new.id::text, 1, 8);

    insert into public.organizations (owner_id, name)
    values (new.id, v_business_name)
    returning id into v_organization_id;

    insert into public.businesses (owner_id, organization_id, name, timezone, slug, type, country, currency)
    values (new.id, v_organization_id, v_business_name, v_timezone, v_slug, v_business_type, v_business_country, v_currency);
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ============================================================
-- 5. create_sede RPC - takes the CURRENT business's id (not a guess) so it
-- resolves the organization unambiguously from whichever sede the owner is
-- looking at in Settings when they click "add another sede".
-- ============================================================

create or replace function public.create_sede(
  p_business_id uuid,
  p_name text,
  p_timezone text default null,
  p_country text default 'PE'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_organization_id uuid;
  v_name text;
  v_country text;
  v_slug text;
  v_business_id uuid;
begin
  v_name := nullif(trim(p_name), '');
  if v_name is null then
    return json_build_object('error', 'name_required');
  end if;

  v_country := coalesce(p_country, 'PE');
  if v_country not in ('PE', 'US') then
    return json_build_object('error', 'invalid_country');
  end if;

  select organization_id into v_organization_id
  from public.businesses
  where id = p_business_id and owner_id = v_owner_id;

  if v_organization_id is null then
    return json_build_object('error', 'no_existing_business');
  end if;

  -- Per-call random suffix (not id-derived like handle_new_user()'s slug)
  -- since the same owner can call this repeatedly.
  v_slug := lower(regexp_replace(v_name, '\s+', '-', 'g')) || '-' || substr(gen_random_uuid()::text, 1, 8);

  begin
    insert into public.businesses (owner_id, organization_id, name, timezone, country, currency, slug)
    values (
      v_owner_id,
      v_organization_id,
      v_name,
      coalesce(nullif(trim(p_timezone), ''), 'America/Lima'),
      v_country,
      case when v_country = 'US' then 'USD' else 'PEN' end,
      v_slug
    )
    returning id into v_business_id;
  exception
    when sqlstate 'SDE01' then
      return json_build_object('error', 'sede_requires_premium');
    when sqlstate 'SDE02' then
      return json_build_object('error', 'sede_limit_reached');
  end;

  return json_build_object('success', true, 'business_id', v_business_id);
end;
$$;

revoke all on function public.create_sede(uuid, text, text, text) from public;
grant execute on function public.create_sede(uuid, text, text, text) to authenticated;

-- ============================================================
-- 6. is_organization_accessible() - mirrors is_business_accessible()'s
-- shape. Deliberate scope: staff who belong to ANY one sede of the org get
-- read/write on the FULL shared client base, not just their own sede's
-- clients - that's the point of unifying clients.
-- ============================================================

create or replace function public.is_organization_accessible(target_organization_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.organizations o
    where o.id = target_organization_id
    and (
      o.owner_id = auth.uid()
      or exists (
        select 1
        from public.business_members bm
        join public.businesses b on b.id = bm.business_id
        where b.organization_id = target_organization_id
          and bm.user_id = auth.uid()
          and public.is_business_paid(b.id)
      )
    )
  );
$$;

revoke all on function public.is_organization_accessible(uuid) from public;
grant execute on function public.is_organization_accessible(uuid) to authenticated;

-- ============================================================
-- 7. clients.organization_id (nullable -> backfill -> NOT NULL).
-- clients.business_id is kept as-is, never dropped - repurposed to "the
-- sede this client record was first created at" (provenance only).
-- ============================================================

alter table public.clients
  add column if not exists organization_id uuid references public.organizations(id);

update public.clients c
set organization_id = b.organization_id
from public.businesses b
where b.id = c.business_id
  and c.organization_id is null;

alter table public.clients
  alter column organization_id set not null;

create index if not exists clients_organization_id_idx on public.clients(organization_id);

-- ============================================================
-- 8. clients RLS: 4 policies switch from is_business_accessible(business_id)
-- to is_organization_accessible(organization_id).
-- ============================================================

drop policy if exists "Users can view clients of their business" on public.clients;
create policy "Users can view clients of their business"
  on public.clients for select
  using (public.is_organization_accessible(organization_id));

drop policy if exists "Users can insert clients to their business" on public.clients;
create policy "Users can insert clients to their business"
  on public.clients for insert
  with check (public.is_organization_accessible(organization_id));

drop policy if exists "Users can update clients of their business" on public.clients;
create policy "Users can update clients of their business"
  on public.clients for update
  using (public.is_organization_accessible(organization_id));

drop policy if exists "Users can delete clients of their business" on public.clients;
create policy "Users can delete clients of their business"
  on public.clients for delete
  using (public.is_organization_accessible(organization_id));

-- ============================================================
-- 9. check_client_limit(): derives organization_id when the caller didn't
-- supply it (the dashboard's own "new client" form and CSV import both
-- only ever set business_id, same as before this migration - neither is
-- being touched), before doing the count check. Postgres evaluates RLS
-- WITH CHECK and NOT NULL constraints against the row AFTER BEFORE INSERT
-- triggers run, so every existing insert path keeps working unchanged.
-- Count/cap switches from business_id to organization_id (cosmetic in
-- practice - Premium, the only tier that can ever have >1 sede, has no
-- client cap at all).
-- ============================================================

create or replace function public.check_client_limit()
returns trigger as $$
declare
  v_count int;
begin
  if new.organization_id is null then
    select organization_id into new.organization_id
    from public.businesses where id = new.business_id;
  end if;

  if public.is_business_paid(new.business_id) then
    return new;
  end if;

  select count(*) into v_count from public.clients where organization_id = new.organization_id;

  if v_count >= 20 then
    raise exception 'free_plan_client_limit' using errcode = 'PLN02';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Trigger wiring unchanged (still enforce_client_limit before insert on
-- clients) - the CREATE OR REPLACE above is enough.

-- ============================================================
-- 10. get_plan_usage(): 'clients' count switches from business_id to the
-- business's organization_id.
-- ============================================================

create or replace function public.get_plan_usage(p_business_id uuid)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_organization_id uuid;
begin
  if not public.is_business_accessible(p_business_id) then
    return json_build_object('error', 'not_accessible');
  end if;

  select organization_id into v_organization_id from public.businesses where id = p_business_id;

  return json_build_object(
    'plan', public.get_business_plan(p_business_id),
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
    'team_seats', (select count(*) from public.business_members where business_id = p_business_id)
  );
end;
$$;

-- ============================================================
-- 11. create_public_reservation: client dedup matching (document_number ->
-- email -> phone) switches from business_id to organization_id, so the
-- same person is recognized across every sede of the same org. Phone
-- normalization still uses the CURRENT booking business's country -
-- accepted edge case if an org's sedes ever span countries, not solved
-- here. New clients get BOTH organization_id (matching/RLS) and
-- business_id (kept - provenance, whichever sede was actually booked
-- through). Same 12-arg signature as script 045/048, plain CREATE OR
-- REPLACE.
-- ============================================================

create or replace function public.create_public_reservation(
  p_slug text,
  p_service_id uuid,
  p_resource_id uuid,
  p_start_time timestamptz,
  p_client_name text,
  p_client_email text,
  p_client_phone text,
  p_notes text,
  p_duration_option_id uuid default null,
  p_needs_parking boolean default false,
  p_hours integer default null,
  p_document_number text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_business_country text;
  v_organization_id uuid;
  v_pricing_mode text;
  v_min_hours int;
  v_max_hours int;
  v_hourly_rate numeric;
  v_hourly_rate_usd numeric;
  v_duration int;
  v_price numeric;
  v_price_usd numeric;
  v_end_time timestamptz;
  v_client_id uuid;
  v_reservation_id uuid;
  v_parking_resource_id uuid;
  v_document_number text;
  v_document_type text;
begin
  if p_start_time < now() then
    return json_build_object('error', 'time_in_past');
  end if;

  select id, country, organization_id into v_business_id, v_business_country, v_organization_id
  from public.businesses where slug = p_slug;
  if v_business_id is null then
    return json_build_object('error', 'business_not_found');
  end if;

  select pricing_mode into v_pricing_mode
  from public.services
  where id = p_service_id and business_id = v_business_id and is_active = true;

  if v_pricing_mode is null then
    return json_build_object('error', 'service_not_found');
  end if;

  if v_pricing_mode = 'hourly' then
    select min_hours, max_hours, hourly_rate, hourly_rate_usd
      into v_min_hours, v_max_hours, v_hourly_rate, v_hourly_rate_usd
    from public.services
    where id = p_service_id;

    if p_hours is null or p_hours < coalesce(v_min_hours, 1) or p_hours > coalesce(v_max_hours, 24) then
      return json_build_object('error', 'invalid_hours');
    end if;

    v_duration := p_hours * 60;
    v_price := case when v_hourly_rate is not null then v_hourly_rate * p_hours end;
    v_price_usd := case when v_hourly_rate_usd is not null then v_hourly_rate_usd * p_hours end;

  elsif v_pricing_mode = 'preset' then
    if p_duration_option_id is null then
      return json_build_object('error', 'duration_option_not_found');
    end if;

    select duration_minutes, price, price_usd into v_duration, v_price, v_price_usd
    from public.service_duration_options
    where id = p_duration_option_id and service_id = p_service_id and business_id = v_business_id;

    if v_duration is null then
      return json_build_object('error', 'duration_option_not_found');
    end if;

  else
    select duration_minutes, price, price_usd into v_duration, v_price, v_price_usd
    from public.services
    where id = p_service_id and business_id = v_business_id and is_active = true;

    if v_duration is null then
      return json_build_object('error', 'service_not_found');
    end if;
  end if;

  if p_resource_id is not null and not exists (
    select 1 from public.resources
    where id = p_resource_id and business_id = v_business_id and is_active = true
  ) then
    return json_build_object('error', 'resource_not_found');
  end if;

  if p_client_name is null or trim(p_client_name) = '' then
    return json_build_object('error', 'name_required');
  end if;

  if (p_client_email is null or trim(p_client_email) = '')
     and (p_client_phone is null or trim(p_client_phone) = '') then
    return json_build_object('error', 'contact_required');
  end if;

  v_end_time := p_start_time + (v_duration || ' minutes')::interval;

  if p_needs_parking then
    v_parking_resource_id := public.find_available_parking_resource(v_business_id, p_start_time, v_end_time);
    if v_parking_resource_id is null then
      return json_build_object('error', 'parking_unavailable');
    end if;
  end if;

  v_document_number := nullif(trim(p_document_number), '');

  if v_document_number is not null then
    select id into v_client_id from public.clients
    where organization_id = v_organization_id and document_number = v_document_number
    limit 1;
  end if;

  if v_client_id is null and p_client_email is not null and trim(p_client_email) <> '' then
    select id into v_client_id from public.clients
    where organization_id = v_organization_id and lower(email) = lower(trim(p_client_email))
    limit 1;
  end if;

  if v_client_id is null and p_client_phone is not null and trim(p_client_phone) <> '' then
    select id into v_client_id from public.clients
    where organization_id = v_organization_id
      and phone is not null
      and public.normalize_phone_for_matching(phone, v_business_country) = public.normalize_phone_for_matching(p_client_phone, v_business_country)
      and public.normalize_phone_for_matching(p_client_phone, v_business_country) is not null
    limit 1;
  end if;

  if v_client_id is null then
    v_document_type := case when v_document_number is not null then
      case when v_business_country = 'US' then 'ein' else 'dni' end
    end;

    insert into public.clients (organization_id, business_id, name, email, phone, document_number, document_type)
    values (
      v_organization_id,
      v_business_id,
      trim(p_client_name),
      nullif(trim(p_client_email), ''),
      nullif(trim(p_client_phone), ''),
      v_document_number,
      v_document_type
    )
    returning id into v_client_id;
  elsif v_document_number is not null then
    update public.clients
    set document_number = v_document_number,
        document_type = coalesce(document_type, case when v_business_country = 'US' then 'ein' else 'dni' end)
    where id = v_client_id and document_number is null;
  end if;

  begin
    insert into public.reservations
      (business_id, client_id, service_id, resource_id, start_time, end_time, status, notes, price, price_usd, parking_resource_id)
    values
      (v_business_id, v_client_id, p_service_id, p_resource_id, p_start_time, v_end_time, 'pending', nullif(trim(p_notes), ''), v_price, v_price_usd, v_parking_resource_id)
    returning id into v_reservation_id;
  exception
    when exclusion_violation then
      return json_build_object('error', 'time_conflict');
    when sqlstate 'PLN01' then
      return json_build_object('error', 'business_reservation_limit_reached');
  end;

  return json_build_object('success', true, 'reservation_id', v_reservation_id);
end;
$$;
