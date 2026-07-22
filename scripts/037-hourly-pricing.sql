-- Third service pricing mode: 'hourly'. The client picks any whole number
-- of hours within a min/max range and price = hours * hourly_rate,
-- computed automatically instead of needing every duration pre-listed like
-- 'preset' mode (script 034) - correct for things like office/equipment
-- rental where any duration in range is fine and pricing is linear.
-- has_flexible_duration (a boolean) doesn't scale to a third state, so it's
-- replaced outright by a proper enum rather than bolted onto with another
-- flag - mixing a boolean and a new mode would allow nonsense combinations.

alter table public.services
  add column if not exists pricing_mode text;

update public.services
  set pricing_mode = case when has_flexible_duration then 'preset' else 'fixed' end
  where pricing_mode is null;

alter table public.services
  alter column pricing_mode set not null;

alter table public.services
  alter column pricing_mode set default 'fixed';

alter table public.services
  drop constraint if exists services_pricing_mode_check;

alter table public.services
  add constraint services_pricing_mode_check check (pricing_mode in ('fixed', 'preset', 'hourly'));

alter table public.services
  add column if not exists hourly_rate numeric;

alter table public.services
  add column if not exists hourly_rate_usd numeric;

alter table public.services
  add column if not exists min_hours integer;

alter table public.services
  add column if not exists max_hours integer;

alter table public.services
  drop column if exists has_flexible_duration;

-- get_public_services (scripts 028/034) now reports pricing_mode and the
-- hourly fields, so the public booking page can offer an hours picker for
-- 'hourly' services instead of a fixed duration or a preset list.
create or replace function public.get_public_services(p_business_id uuid)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(json_agg(
    json_build_object(
      'id', s.id,
      'name', s.name,
      'description', s.description,
      'duration_minutes', s.duration_minutes,
      'price', s.price,
      'price_usd', s.price_usd,
      'color', s.color,
      'pricing_mode', s.pricing_mode,
      'hourly_rate', s.hourly_rate,
      'hourly_rate_usd', s.hourly_rate_usd,
      'min_hours', s.min_hours,
      'max_hours', s.max_hours,
      'duration_options', (
        select coalesce(json_agg(
          json_build_object(
            'id', o.id,
            'duration_minutes', o.duration_minutes,
            'price', o.price,
            'price_usd', o.price_usd
          )
          order by o.duration_minutes
        ), '[]'::json)
        from public.service_duration_options o
        where o.service_id = s.id
      ),
      'resources', (
        select coalesce(json_agg(json_build_object('id', r.id, 'name', r.name, 'color', r.color)), '[]'::json)
        from public.service_resources sr
        join public.resources r on r.id = sr.resource_id and r.is_active
        where sr.service_id = s.id
      )
    )
    order by s.name
  ), '[]'::json)
  from public.services s
  where s.business_id = p_business_id and s.is_active = true;
$$;

-- create_public_reservation (scripts 028/031/034/035) now branches on the
-- service's pricing_mode to resolve duration/price - hourly multiplies
-- p_hours by the rate (validated against min/max), preset looks up the
-- chosen option, fixed uses the service's own single values. The old
-- 10-arg signature is dropped explicitly (same note as every prior script
-- touching this function re: CREATE OR REPLACE not touching a changed
-- parameter list).
drop function if exists public.create_public_reservation(text, uuid, uuid, timestamptz, text, text, text, text, uuid, boolean);

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
  p_hours integer default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
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
begin
  if p_start_time < now() then
    return json_build_object('error', 'time_in_past');
  end if;

  select id into v_business_id from public.businesses where slug = p_slug;
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

  if p_client_email is not null and trim(p_client_email) <> '' then
    select id into v_client_id from public.clients
    where business_id = v_business_id and lower(email) = lower(trim(p_client_email))
    limit 1;
  end if;

  if v_client_id is null and p_client_phone is not null and trim(p_client_phone) <> '' then
    select id into v_client_id from public.clients
    where business_id = v_business_id and phone = trim(p_client_phone)
    limit 1;
  end if;

  if v_client_id is null then
    insert into public.clients (business_id, name, email, phone)
    values (v_business_id, trim(p_client_name), nullif(trim(p_client_email), ''), nullif(trim(p_client_phone), ''))
    returning id into v_client_id;
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
  end;

  return json_build_object('success', true, 'reservation_id', v_reservation_id);
end;
$$;

revoke all on function public.create_public_reservation(text, uuid, uuid, timestamptz, text, text, text, text, uuid, boolean, integer) from public;
grant execute on function public.create_public_reservation(text, uuid, uuid, timestamptz, text, text, text, text, uuid, boolean, integer) to anon, authenticated;
