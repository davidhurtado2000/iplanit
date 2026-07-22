-- Cochera (parking): free for every plan, not Premium-gated - it's a
-- client-trust feature for the public booking page (reassuring a stranger
-- about where to park before they even meet you), not an internal scaling
-- tool like Team/Reportes. Modeled as one more resource type (a parking
-- spot is just a resource nobody needs to tell apart by name) instead of a
-- bespoke capacity system, so it reuses the exact overlap-checking
-- infrastructure that already prevents double-booking a room or a piece of
-- equipment - no new "communicate unavailability" system needed, it just
-- falls out of the existing real-time check.

alter table public.businesses
  add column if not exists offers_parking boolean not null default false;

alter table public.resources
  drop constraint if exists resources_type_check;

alter table public.resources
  add constraint resources_type_check
  check (type in ('room', 'person', 'equipment', 'virtual', 'parking'));

-- A reservation's parking spot is independent of its main resource_id - a
-- client booking a haircut in "Sala 2" might separately want a parking
-- spot, which is a different resource with its own availability.
alter table public.reservations
  add column if not exists parking_resource_id uuid references public.resources(id) on delete set null;

-- Same guarantee as reservations_no_overlap (script 012), scoped to the
-- parking assignment - the real source of truth against race conditions;
-- find_available_parking_resource() below is only a fast pre-flight for a
-- friendlier error message.
alter table public.reservations
  drop constraint if exists reservations_parking_no_overlap;

alter table public.reservations
  add constraint reservations_parking_no_overlap
  exclude using gist (
    parking_resource_id with =,
    tstzrange(start_time, end_time) with &&
  )
  where (status <> 'cancelled' and parking_resource_id is not null);

-- Returns one currently-free parking-type resource for the given business
-- and time range, or null if all spots are taken. Used by both the
-- internal reservation modal and create_public_reservation below - a spot
-- is fungible (nobody cares WHICH numbered space they get), so "any free
-- one" is all that's needed.
create or replace function public.find_available_parking_resource(
  p_business_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select r.id
  from public.resources r
  where r.business_id = p_business_id
    and r.type = 'parking'
    and r.is_active = true
    and not exists (
      select 1 from public.reservations res
      where res.parking_resource_id = r.id
        and res.status <> 'cancelled'
        and res.start_time < p_end
        and res.end_time > p_start
    )
  order by r.name
  limit 1;
$$;

revoke all on function public.find_available_parking_resource(uuid, timestamptz, timestamptz) from public;
grant execute on function public.find_available_parking_resource(uuid, timestamptz, timestamptz) to authenticated, anon;

-- get_public_business (script 028) now also reports whether the business
-- offers parking, so the public booking page knows whether to show the
-- "I'm driving, reserve a spot" checkbox at all. Same args, so this is a
-- plain CREATE OR REPLACE - no signature change, no DROP needed.
create or replace function public.get_public_business(p_slug text)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
    'id', id,
    'name', name,
    'description', description,
    'address', address,
    'phone', phone,
    'timezone', timezone,
    'logo_url', logo_url,
    'offers_parking', offers_parking
  )
  from public.businesses
  where slug = p_slug
  limit 1;
$$;

-- create_public_reservation (scripts 028/031/034) now accepts an optional
-- "I need parking" flag. When requested, a spot is assigned as part of the
-- same insert if one is actually available; if none is free, the whole
-- reservation is rejected instead of silently dropping the parking request
-- - the client finds out immediately, same reasoning as every other
-- availability check on this page. The old 9-arg signature is dropped
-- explicitly (same note as scripts 032/034 re: CREATE OR REPLACE not
-- touching a changed parameter list).
drop function if exists public.create_public_reservation(text, uuid, uuid, timestamptz, text, text, text, text, uuid);

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
  p_needs_parking boolean default false
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
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

  if p_duration_option_id is not null then
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

revoke all on function public.create_public_reservation(text, uuid, uuid, timestamptz, text, text, text, text, uuid, boolean) from public;
grant execute on function public.create_public_reservation(text, uuid, uuid, timestamptz, text, text, text, text, uuid, boolean) to anon, authenticated;

revoke all on function public.get_public_business(text) from public;
grant execute on function public.get_public_business(text) to anon, authenticated;
