-- Public booking page (no login required): a stranger with the business's
-- link picks a service, a time, and books - landing as a 'pending'
-- reservation for the owner to confirm, reusing the status workflow that
-- already exists. Free for everyone, not Premium-gated.
--
-- None of this grants the anon/authenticated roles direct table access.
-- Every read and the one write go through narrow, security definer RPCs
-- that return only what a stranger should ever see (no other clients'
-- names/phone numbers, no internal fields) - same pattern already used for
-- add_business_staff() in script 024, just applied to an anonymous caller
-- instead of a logged-in one.

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
    'logo_url', logo_url
  )
  from public.businesses
  where slug = p_slug
  limit 1;
$$;

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
      -- Only populated when the owner explicitly linked this service to
      -- specific resources - that's the signal used to decide whether the
      -- public page should ask the visitor to pick one at all.
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

create or replace function public.get_public_business_hours(p_business_id uuid)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(json_agg(
    json_build_object(
      'day_of_week', day_of_week,
      'open_time', open_time,
      'close_time', close_time,
      'is_closed', is_closed
    )
  ), '[]'::json)
  from public.business_hours
  where business_id = p_business_id;
$$;

-- Busy time ranges only (no client_id, no notes, no names) for a single
-- resource - a service with no resource requirement has nothing to check
-- against here (p_resource_id null matches no rows), same as the exclusion
-- constraint's own behavior for resource-less reservations.
create or replace function public.get_public_busy_times(
  p_business_id uuid,
  p_resource_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(json_agg(
    json_build_object('start_time', start_time, 'end_time', end_time)
  ), '[]'::json)
  from public.reservations
  where business_id = p_business_id
    and resource_id = p_resource_id
    and status <> 'cancelled'
    and start_time < p_to
    and end_time > p_from;
$$;

create or replace function public.create_public_reservation(
  p_slug text,
  p_service_id uuid,
  p_resource_id uuid,
  p_start_time timestamptz,
  p_client_name text,
  p_client_email text,
  p_client_phone text,
  p_notes text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_duration int;
  v_end_time timestamptz;
  v_client_id uuid;
begin
  if p_start_time < now() then
    return json_build_object('error', 'time_in_past');
  end if;

  select id into v_business_id from public.businesses where slug = p_slug;
  if v_business_id is null then
    return json_build_object('error', 'business_not_found');
  end if;

  select duration_minutes into v_duration
  from public.services
  where id = p_service_id and business_id = v_business_id and is_active = true;

  if v_duration is null then
    return json_build_object('error', 'service_not_found');
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

  -- Match an existing client by email, then phone, within this business
  -- only - never across businesses - before creating a new one.
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
      (business_id, client_id, service_id, resource_id, start_time, end_time, status, notes)
    values
      (v_business_id, v_client_id, p_service_id, p_resource_id, p_start_time, v_end_time, 'pending', nullif(trim(p_notes), ''));
  exception
    -- 23P01: raised by reservations_no_overlap (script 012) when someone
    -- else grabs the same slot between the availability check and this
    -- insert - the DB constraint is the real guarantee, this RPC is just a
    -- friendlier way to hit it than a raw insert would be.
    when exclusion_violation then
      return json_build_object('error', 'time_conflict');
  end;

  return json_build_object('success', true);
end;
$$;

revoke all on function public.get_public_business(text) from public;
revoke all on function public.get_public_services(uuid) from public;
revoke all on function public.get_public_business_hours(uuid) from public;
revoke all on function public.get_public_busy_times(uuid, uuid, timestamptz, timestamptz) from public;
revoke all on function public.create_public_reservation(text, uuid, uuid, timestamptz, text, text, text, text) from public;

grant execute on function public.get_public_business(text) to anon, authenticated;
grant execute on function public.get_public_services(uuid) to anon, authenticated;
grant execute on function public.get_public_business_hours(uuid) to anon, authenticated;
grant execute on function public.get_public_busy_times(uuid, uuid, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.create_public_reservation(text, uuid, uuid, timestamptz, text, text, text, text) to anon, authenticated;
