-- The Upgrade modal has always advertised free-plan caps (50 reservations/
-- month, 20 clients, 3 services, 2 resources) and "advanced notifications"
-- as Premium perks, but nothing in the database ever enforced them - a free
-- account could create unlimited everything. This adds real enforcement via
-- BEFORE INSERT triggers, so it's a single source of truth that covers every
-- insert path (the internal dashboard AND create_public_reservation, used by
-- a business's own clients booking through the public link) rather than a
-- client-side-only check that a public API caller could just skip.
--
-- Premium status check reuses the businesses.owner_id -> profiles.plan
-- lookup already established by script 027 (is_business_accessible), not
-- businesses.plan, which is unused everywhere else in the app.

create or replace function public.is_business_premium(target_business_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.businesses b
    join public.profiles p on p.id = b.owner_id
    where b.id = target_business_id and p.plan = 'premium'
  );
$$;

-- Reservations: counts by created_at (creation), not appointment date, and
-- regardless of later status - counting only "active" reservations would let
-- someone dodge the cap by cancelling and recreating in the same month.
create or replace function public.check_reservation_limit()
returns trigger as $$
declare
  v_count int;
begin
  if public.is_business_premium(new.business_id) then
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

drop trigger if exists enforce_reservation_limit on public.reservations;
create trigger enforce_reservation_limit
  before insert on public.reservations
  for each row execute function public.check_reservation_limit();

-- Clients: total count (not just is_active) - an inactive/soft-deleted
-- client record still occupies a row, and using it to "make room" for a new
-- one for free would defeat the point of the cap.
create or replace function public.check_client_limit()
returns trigger as $$
declare
  v_count int;
begin
  if public.is_business_premium(new.business_id) then
    return new;
  end if;

  select count(*) into v_count from public.clients where business_id = new.business_id;

  if v_count >= 20 then
    raise exception 'free_plan_client_limit' using errcode = 'PLN02';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists enforce_client_limit on public.clients;
create trigger enforce_client_limit
  before insert on public.clients
  for each row execute function public.check_client_limit();

create or replace function public.check_service_limit()
returns trigger as $$
declare
  v_count int;
begin
  if public.is_business_premium(new.business_id) then
    return new;
  end if;

  select count(*) into v_count from public.services where business_id = new.business_id;

  if v_count >= 3 then
    raise exception 'free_plan_service_limit' using errcode = 'PLN03';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists enforce_service_limit on public.services;
create trigger enforce_service_limit
  before insert on public.services
  for each row execute function public.check_service_limit();

-- Resources: parking spots are a separate feature (Cochera, its own page)
-- with no free-plan cap of its own - never counted against this limit, and
-- inserting one never triggers this check at all.
create or replace function public.check_resource_limit()
returns trigger as $$
declare
  v_count int;
begin
  if new.type = 'parking' then
    return new;
  end if;

  if public.is_business_premium(new.business_id) then
    return new;
  end if;

  select count(*) into v_count
  from public.resources
  where business_id = new.business_id and type <> 'parking';

  if v_count >= 2 then
    raise exception 'free_plan_resource_limit' using errcode = 'PLN04';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists enforce_resource_limit on public.resources;
create trigger enforce_resource_limit
  before insert on public.resources
  for each row execute function public.check_resource_limit();

-- Lets the dashboard proactively show the Upgrade modal (before a user fills
-- out a whole form) instead of only reacting to a trigger error afterward.
-- Gated by is_business_accessible so a user can only read usage for a
-- business they actually belong to.
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
    'reservations_this_month', (
      select count(*) from public.reservations
      where business_id = p_business_id and created_at >= date_trunc('month', now())
    ),
    'clients', (select count(*) from public.clients where business_id = p_business_id),
    'services', (select count(*) from public.services where business_id = p_business_id),
    'resources', (
      select count(*) from public.resources
      where business_id = p_business_id and type <> 'parking'
    )
  );
end;
$$;

revoke all on function public.get_plan_usage(uuid) from public;
grant execute on function public.get_plan_usage(uuid) to authenticated;

-- create_public_reservation (script 045's version, same signature - plain
-- CREATE OR REPLACE) now also catches the new reservation-limit trigger and
-- turns it into a friendly error code, same pattern already used just below
-- it for the overlap exclusion_violation. The client booking through the
-- public link is never shown "upgrade to Premium" (that's meaningless to
-- them) - the frontend maps this error code to a neutral "this business
-- isn't taking more bookings this month" message instead.
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

  select id, country into v_business_id, v_business_country from public.businesses where slug = p_slug;
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
    where business_id = v_business_id and document_number = v_document_number
    limit 1;
  end if;

  if v_client_id is null and p_client_email is not null and trim(p_client_email) <> '' then
    select id into v_client_id from public.clients
    where business_id = v_business_id and lower(email) = lower(trim(p_client_email))
    limit 1;
  end if;

  if v_client_id is null and p_client_phone is not null and trim(p_client_phone) <> '' then
    select id into v_client_id from public.clients
    where business_id = v_business_id
      and phone is not null
      and public.normalize_phone_for_matching(phone, v_business_country) = public.normalize_phone_for_matching(p_client_phone, v_business_country)
      and public.normalize_phone_for_matching(p_client_phone, v_business_country) is not null
    limit 1;
  end if;

  if v_client_id is null then
    v_document_type := case when v_document_number is not null then
      case when v_business_country = 'US' then 'ein' else 'dni' end
    end;

    insert into public.clients (business_id, name, email, phone, document_number, document_type)
    values (
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
