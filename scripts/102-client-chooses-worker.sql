-- "Elegir barbero" on the public booking link (first real client: a
-- barbershop). Generic on purpose: the toggle is "clients can choose who
-- serves them", usable by any business with staff (salons, spas, clinics,
-- tutors), not a barbershop-only mode. The signup business type only sets
-- the DEFAULT (salon/spa start with it on) so it feels made for them
-- without a second version of the product to maintain.
--
-- Workers, not resources: a barber has their own hours, their own service
-- list (worker_services), and their own calendar feed (scripts/100) -
-- resources stay for chairs/rooms/equipment.

-- 1. Business-level toggle + worker photos
alter table public.businesses
  add column if not exists client_chooses_worker boolean not null default false;

alter table public.workers
  add column if not exists photo_url text;

-- Existing salons/spas (e.g. the first barbershop client, already signed up)
-- get the same default new ones will. Harmless for any that have no active
-- workers yet: the public step only appears once there are workers to pick.
update public.businesses
set client_chooses_worker = true
where type in ('salon', 'spa');

create or replace function public.set_business_type_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.type in ('salon', 'spa') then
    new.client_chooses_worker := true;
  end if;
  return new;
end;
$$;

drop trigger if exists businesses_type_defaults on public.businesses;
create trigger businesses_type_defaults
  before insert on public.businesses
  for each row execute function public.set_business_type_defaults();

-- 2. Worker photos bucket - same shape/policies as service-images
-- (scripts/097): public read, writes scoped to owner/admin of the business
-- whose id is the first path segment.
insert into storage.buckets (id, name, public, file_size_limit)
values ('worker-photos', 'worker-photos', true, 2097152)
on conflict (id) do nothing;

drop policy if exists "Worker photos are publicly accessible" on storage.objects;
create policy "Worker photos are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'worker-photos');

drop policy if exists "Owner/admin can upload worker photos" on storage.objects;
create policy "Owner/admin can upload worker photos"
  on storage.objects for insert
  with check (
    bucket_id = 'worker-photos'
    and public.business_member_role(((storage.foldername(name))[1])::uuid) in ('owner', 'admin')
  );

drop policy if exists "Owner/admin can update worker photos" on storage.objects;
create policy "Owner/admin can update worker photos"
  on storage.objects for update
  using (
    bucket_id = 'worker-photos'
    and public.business_member_role(((storage.foldername(name))[1])::uuid) in ('owner', 'admin')
  );

drop policy if exists "Owner/admin can delete worker photos" on storage.objects;
create policy "Owner/admin can delete worker photos"
  on storage.objects for delete
  using (
    bucket_id = 'worker-photos'
    and public.business_member_role(((storage.foldername(name))[1])::uuid) in ('owner', 'admin')
  );

-- 3. get_public_business (latest prior: scripts/082) - adds the toggle.
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
    'offers_parking', offers_parking,
    'notify_confirmations', notify_confirmations,
    'country', country,
    'client_chooses_worker', client_chooses_worker
  )
  from public.businesses
  where slug = p_slug
  limit 1;
$$;

revoke all on function public.get_public_business(text) from public;
grant execute on function public.get_public_business(text) to anon, authenticated;

-- 4. Public worker list - only exposed when the business opted in, and only
-- what a client needs to pick someone: name, photo, which services they do
-- (empty = all, same convention as the dashboard's worker form), and their
-- own schedule (empty = follows business hours).
create or replace function public.get_public_workers(p_business_id uuid)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(json_agg(
    json_build_object(
      'id', w.id,
      'name', w.name,
      'photo_url', w.photo_url,
      'service_ids', coalesce((
        select json_agg(ws.service_id) from public.worker_services ws where ws.worker_id = w.id
      ), '[]'::json),
      'hours', coalesce((
        select json_agg(json_build_object(
          'day_of_week', wh.day_of_week,
          'open_time', wh.open_time,
          'close_time', wh.close_time,
          'is_closed', wh.is_closed
        ))
        from public.worker_hours wh where wh.worker_id = w.id
      ), '[]'::json)
    ) order by w.name
  ), '[]'::json)
  from public.workers w
  join public.businesses b on b.id = w.business_id
  where w.business_id = p_business_id
    and w.is_active = true
    and b.client_chooses_worker = true;
$$;

revoke all on function public.get_public_workers(uuid) from public;
grant execute on function public.get_public_workers(uuid) to anon, authenticated;

-- 5. A worker's busy ranges for the slot picker - same shape and buffer
-- expansion as get_public_busy_times (scripts/040), but keyed on worker.
-- Left join (not inner) so a visit with no service still blocks the time.
-- A worker who can take several services at once (scripts/094
-- allows_concurrent_services) is never "busy" from the picker's view.
create or replace function public.get_public_worker_busy_times(
  p_business_id uuid,
  p_worker_id uuid,
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
    json_build_object(
      'start_time', r.start_time - (coalesce(s.buffer_before_min, 0) || ' minutes')::interval,
      'end_time', r.end_time + (coalesce(s.buffer_after_min, 0) || ' minutes')::interval
    )
  ), '[]'::json)
  from public.reservations r
  left join public.services s on s.id = r.service_id
  join public.workers w on w.id = r.worker_id
  where r.business_id = p_business_id
    and r.worker_id = p_worker_id
    and w.allows_concurrent_services = false
    and r.status <> 'cancelled'
    and r.start_time < p_to
    and r.end_time > p_from;
$$;

revoke all on function public.get_public_worker_busy_times(uuid, uuid, timestamptz, timestamptz) from public;
grant execute on function public.get_public_worker_busy_times(uuid, uuid, timestamptz, timestamptz) to anon, authenticated;

-- 6. Can this worker take this exact booking? Internal helper only (never
-- granted to anon) - the server-side source of truth so a direct RPC call
-- can't book a barber who's off, busy, or doesn't do that service, no
-- matter what the page showed (same lesson as scripts/098).
create or replace function public.worker_can_take_booking(
  p_worker_id uuid,
  p_business_id uuid,
  p_service_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_buffer_before int,
  p_buffer_after int
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_tz text;
  v_concurrent boolean;
  v_local_start timestamp;
  v_local_end timestamp;
  v_hours record;
begin
  select w.allows_concurrent_services, b.timezone into v_concurrent, v_tz
  from public.workers w
  join public.businesses b on b.id = w.business_id
  where w.id = p_worker_id and w.business_id = p_business_id and w.is_active = true;

  if v_tz is null then
    return false;
  end if;

  -- No worker_services rows = does every service (dashboard convention).
  if exists (select 1 from public.worker_services where worker_id = p_worker_id)
     and not exists (
       select 1 from public.worker_services where worker_id = p_worker_id and service_id = p_service_id
     ) then
    return false;
  end if;

  -- No worker_hours rows = follows business hours, which this function
  -- doesn't re-validate (create_public_reservation never has either).
  if exists (select 1 from public.worker_hours where worker_id = p_worker_id) then
    v_local_start := p_start at time zone v_tz;
    v_local_end := p_end at time zone v_tz;
    select * into v_hours from public.worker_hours
    where worker_id = p_worker_id and day_of_week = extract(dow from v_local_start)::int;

    if v_hours is null
       or v_hours.is_closed
       or v_local_end::date <> v_local_start::date
       or v_local_start::time < v_hours.open_time
       or v_local_end::time > v_hours.close_time then
      return false;
    end if;
  end if;

  if v_concurrent then
    return true;
  end if;

  return not exists (
    select 1
    from public.reservations r
    left join public.services s on s.id = r.service_id
    where r.worker_id = p_worker_id
      and r.status <> 'cancelled'
      and r.start_time - (coalesce(s.buffer_before_min, 0) || ' minutes')::interval
          < p_end + (coalesce(p_buffer_after, 0) || ' minutes')::interval
      and r.end_time + (coalesce(s.buffer_after_min, 0) || ' minutes')::interval
          > p_start - (coalesce(p_buffer_before, 0) || ' minutes')::interval
  );
end;
$$;

revoke all on function public.worker_can_take_booking(uuid, uuid, uuid, timestamptz, timestamptz, int, int) from public, anon, authenticated;

-- 7. create_public_reservation (latest prior: scripts/098) - adds
-- p_worker_id. New trailing param with a default, but Postgres still treats
-- it as a different signature, so the old one is dropped first (same as
-- every prior redefinition: 034/035/037/045).
--
-- When the business has client_chooses_worker on:
--   * a chosen worker is validated server-side (worker_can_take_booking);
--   * "Sin preferencia" (null) auto-assigns the eligible worker with the
--     fewest bookings that day, so load spreads instead of always landing
--     on the alphabetically-first barber;
--   * a business with no eligible workers for that service books exactly
--     as before (worker_id null).
-- Per-worker advisory locks serialize two simultaneous bookings for the
-- same barber - unlike resources there's no DB exclusion constraint on
-- worker_id to catch a double-booking race.
drop function if exists public.create_public_reservation(text, uuid, uuid, timestamptz, text, text, text, text, uuid, boolean, integer, text);

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
  p_document_number text default null,
  p_worker_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_business_country text;
  v_business_tz text;
  v_organization_id uuid;
  v_client_chooses_worker boolean;
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
  v_client_chooses_resource boolean;
  v_buffer_before int;
  v_buffer_after int;
  v_worker_id uuid;
  v_candidate uuid;
  v_has_eligible boolean;
begin
  if p_start_time < now() then
    return json_build_object('error', 'time_in_past');
  end if;

  select id, country, organization_id, timezone, client_chooses_worker
    into v_business_id, v_business_country, v_organization_id, v_business_tz, v_client_chooses_worker
  from public.businesses where slug = p_slug;
  if v_business_id is null then
    return json_build_object('error', 'business_not_found');
  end if;

  select pricing_mode, client_chooses_resource, buffer_before_min, buffer_after_min
    into v_pricing_mode, v_client_chooses_resource, v_buffer_before, v_buffer_after
  from public.services
  where id = p_service_id
    and business_id = v_business_id
    and is_active = true
    and visible_on_public_link = true;

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
    where id = p_service_id and business_id = v_business_id and is_active = true and visible_on_public_link = true;

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

  if char_length(trim(p_client_name)) > 200 then
    return json_build_object('error', 'name_too_long');
  end if;

  if p_client_email is not null and trim(p_client_email) <> ''
     and trim(p_client_email) !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    return json_build_object('error', 'invalid_email');
  end if;

  if p_client_phone is not null and char_length(trim(p_client_phone)) > 30 then
    return json_build_object('error', 'phone_too_long');
  end if;

  if p_notes is not null and char_length(trim(p_notes)) > 2000 then
    return json_build_object('error', 'notes_too_long');
  end if;

  if p_document_number is not null and char_length(trim(p_document_number)) > 50 then
    return json_build_object('error', 'document_number_too_long');
  end if;

  v_end_time := p_start_time + (v_duration || ' minutes')::interval;

  if p_resource_id is null and v_client_chooses_resource is false then
    select r.id into p_resource_id
    from public.service_resources sr
    join public.resources r on r.id = sr.resource_id and r.is_active
    where sr.service_id = p_service_id
      and not exists (
        select 1 from public.reservations res
        where res.resource_id = r.id
          and res.status <> 'cancelled'
          and res.start_time < v_end_time
          and res.end_time > p_start_time
      )
    order by r.name
    limit 1;
  end if;

  -- Worker selection - before any client insert below, so a rejected
  -- booking never leaves an orphan client row behind.
  if v_client_chooses_worker then
    if p_worker_id is not null then
      perform pg_advisory_xact_lock(hashtextextended('worker:' || p_worker_id::text, 0));
      if not public.worker_can_take_booking(
        p_worker_id, v_business_id, p_service_id, p_start_time, v_end_time, v_buffer_before, v_buffer_after
      ) then
        return json_build_object('error', 'worker_unavailable');
      end if;
      v_worker_id := p_worker_id;
    else
      v_has_eligible := false;
      for v_candidate in
        select w.id
        from public.workers w
        where w.business_id = v_business_id
          and w.is_active = true
          and (
            not exists (select 1 from public.worker_services ws where ws.worker_id = w.id)
            or exists (select 1 from public.worker_services ws where ws.worker_id = w.id and ws.service_id = p_service_id)
          )
        order by (
          select count(*) from public.reservations r
          where r.worker_id = w.id
            and r.status <> 'cancelled'
            and (r.start_time at time zone v_business_tz)::date = (p_start_time at time zone v_business_tz)::date
        ), w.name
      loop
        v_has_eligible := true;
        perform pg_advisory_xact_lock(hashtextextended('worker:' || v_candidate::text, 0));
        if public.worker_can_take_booking(
          v_candidate, v_business_id, p_service_id, p_start_time, v_end_time, v_buffer_before, v_buffer_after
        ) then
          v_worker_id := v_candidate;
          exit;
        end if;
      end loop;

      if v_has_eligible and v_worker_id is null then
        return json_build_object('error', 'worker_unavailable');
      end if;
    end if;
  end if;

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
  else
    update public.clients
    set email = coalesce(email, nullif(trim(p_client_email), '')),
        phone = coalesce(phone, nullif(trim(p_client_phone), '')),
        document_number = coalesce(document_number, v_document_number),
        document_type = coalesce(
          document_type,
          case when v_document_number is not null then
            case when v_business_country = 'US' then 'ein' else 'dni' end
          end
        )
    where id = v_client_id;
  end if;

  begin
    insert into public.reservations
      (business_id, client_id, service_id, resource_id, worker_id, start_time, end_time, status, notes, price, price_usd, parking_resource_id)
    values
      (v_business_id, v_client_id, p_service_id, p_resource_id, v_worker_id, p_start_time, v_end_time, 'pending', nullif(trim(p_notes), ''), v_price, v_price_usd, v_parking_resource_id)
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

revoke all on function public.create_public_reservation(text, uuid, uuid, timestamptz, text, text, text, text, uuid, boolean, integer, text, uuid) from public;
grant execute on function public.create_public_reservation(text, uuid, uuid, timestamptz, text, text, text, text, uuid, boolean, integer, text, uuid) to anon, authenticated;
