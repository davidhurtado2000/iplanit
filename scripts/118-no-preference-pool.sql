-- "Sin preferencia" as a REAL pool (Carppone, 2026-11-17). Builds on 116/117.
--
-- no_preference_mode = 'pool': a booking with no preference is stored with
-- NO barber (worker_id null, no_preference_pool = true) until reception picks
-- one. It takes no particular barber's time (a loyal client can still book
-- that barber at that hour) but uses one unit of the team's capacity: it is
-- accepted only while free barbers > pool bookings at that time. The same
-- condition applies to a client booking a specific barber, so the shop is
-- never overbooked. lib/pool-capacity.ts mirrors the rule for the slot lists.
--
-- Run in PARTS, outside the shop's hours, and close Supabase afterwards.

-- ============================ PART 1: columns ================================
alter table public.reservations
  add column if not exists no_preference_pool boolean not null default false;

alter table public.businesses drop constraint if exists businesses_no_preference_mode_check;
alter table public.businesses add constraint businesses_no_preference_mode_check
  check (no_preference_mode in ('auto', 'auto_review', 'pool'));

-- ====================== PART 2: capacity helper functions ====================
-- Barbers able to take the appointment for its whole length (schedule, time
-- blocks, their own bookings, buffers - worker_can_take_booking, scripts/102).
create or replace function public.pool_free_workers(
  p_business_id uuid, p_service_id uuid, p_start timestamptz, p_end timestamptz,
  p_buffer_before int, p_buffer_after int
)
returns int
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::int
  from public.workers w
  where w.business_id = p_business_id
    and w.is_active = true
    and (
      not exists (select 1 from public.worker_services ws where ws.worker_id = w.id)
      or exists (select 1 from public.worker_services ws where ws.worker_id = w.id and ws.service_id = p_service_id)
    )
    and public.worker_can_take_booking(w.id, p_business_id, p_service_id, p_start, p_end, p_buffer_before, p_buffer_after);
$$;

-- Pool bookings (no barber yet) overlapping the appointment, buffers included.
create or replace function public.pool_booking_count(
  p_business_id uuid, p_start timestamptz, p_end timestamptz, p_buffer_before int, p_buffer_after int
)
returns int
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::int
  from public.reservations r
  where r.business_id = p_business_id
    and r.no_preference_pool = true
    and r.status <> 'cancelled'
    and r.start_time < p_end + make_interval(mins => p_buffer_after)
    and r.end_time > p_start - make_interval(mins => p_buffer_before);
$$;

-- What the public booking page needs to compute slots in pool mode: whether
-- the business uses it, and the pool bookings' time ranges (no client data).
create or replace function public.get_public_pool_info(p_business_id uuid, p_from timestamptz, p_to timestamptz)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
    'enabled', (b.no_preference_mode = 'pool'),
    'ranges', coalesce((
      select json_agg(json_build_object('start_time', r.start_time, 'end_time', r.end_time))
      from public.reservations r
      where r.business_id = b.id
        and r.no_preference_pool = true
        and r.status <> 'cancelled'
        and r.start_time < p_to
        and r.end_time > p_from
    ), '[]'::json)
  )
  from public.businesses b
  where b.id = p_business_id;
$$;

revoke all on function public.pool_free_workers(uuid, uuid, timestamptz, timestamptz, int, int) from public, anon, authenticated;
revoke all on function public.pool_booking_count(uuid, timestamptz, timestamptz, int, int) from public, anon, authenticated;
revoke all on function public.get_public_pool_info(uuid, timestamptz, timestamptz) from public;
grant execute on function public.get_public_pool_info(uuid, timestamptz, timestamptz) to anon, authenticated;

-- ============ PART 3: the public booking function, pool-aware ================
-- scripts/116's create_public_reservation plus the pool: in pool mode
-- "Sin preferencia" stores no barber but needs capacity, and a specific
-- barber is only accepted while capacity remains for the pool bookings.
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
  v_no_pref_mode text;
  v_auto_assigned boolean := false;
  v_pool boolean := false;
  v_eligible int;
begin
  if p_start_time < now() then
    return json_build_object('error', 'time_in_past');
  end if;

  select id, country, organization_id, timezone, client_chooses_worker, no_preference_mode
    into v_business_id, v_business_country, v_organization_id, v_business_tz, v_client_chooses_worker, v_no_pref_mode
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
      and not exists (
        select 1 from public.time_block_ranges(v_business_id, p_start_time, v_end_time) b
        where b.resource_id = r.id and b.start_at < v_end_time and b.end_at > p_start_time
      )
    order by r.name
    limit 1;
  end if;

  -- Time blocks (scripts/107): a business-wide block (lunch, unexpected
  -- closure) or one on the resource being booked rejects the slot.
  -- Worker-specific blocks are checked inside worker_can_take_booking.
  if exists (
    select 1 from public.time_block_ranges(v_business_id, p_start_time, v_end_time) b
    where b.start_at < v_end_time and b.end_at > p_start_time
      and (
        (b.worker_id is null and b.resource_id is null)
        or (p_resource_id is not null and b.resource_id = p_resource_id)
      )
  ) then
    return json_build_object('error', 'time_blocked');
  end if;

  -- Worker selection - before any client insert below, so a rejected
  -- booking never leaves an orphan client row behind.
  if v_client_chooses_worker then
    if p_worker_id is not null then
      if v_no_pref_mode = 'pool' then
        perform pg_advisory_xact_lock(hashtextextended('pool:' || v_business_id::text, 0));
      end if;
      perform pg_advisory_xact_lock(hashtextextended('worker:' || p_worker_id::text, 0));
      if not public.worker_can_take_booking(
        p_worker_id, v_business_id, p_service_id, p_start_time, v_end_time, v_buffer_before, v_buffer_after
      ) then
        return json_build_object('error', 'worker_unavailable');
      end if;
      v_worker_id := p_worker_id;
      if v_no_pref_mode = 'pool'
         and public.pool_free_workers(v_business_id, p_service_id, p_start_time, v_end_time, v_buffer_before, v_buffer_after)
             <= public.pool_booking_count(v_business_id, p_start_time, v_end_time, v_buffer_before, v_buffer_after) then
        return json_build_object('error', 'worker_unavailable');
      end if;
    elsif v_no_pref_mode = 'pool' then
      -- "Sin preferencia" as a real pool: no barber is assigned (and no
      -- barber's time is taken) until reception picks one, but the booking
      -- uses one unit of capacity, so it's only accepted while there are
      -- more free barbers than pool bookings at that time.
      perform pg_advisory_xact_lock(hashtextextended('pool:' || v_business_id::text, 0));
      select count(*) into v_eligible
      from public.workers w
      where w.business_id = v_business_id
        and w.is_active = true
        and (
          not exists (select 1 from public.worker_services ws where ws.worker_id = w.id)
          or exists (select 1 from public.worker_services ws where ws.worker_id = w.id and ws.service_id = p_service_id)
        );
      if v_eligible > 0 then
        if public.pool_free_workers(v_business_id, p_service_id, p_start_time, v_end_time, v_buffer_before, v_buffer_after)
           <= public.pool_booking_count(v_business_id, p_start_time, v_end_time, v_buffer_before, v_buffer_after) then
          return json_build_object('error', 'worker_unavailable');
        end if;
        v_pool := true;
      end if;
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

      -- "Sin preferencia" and the business wants to review who got it
      -- (businesses.no_preference_mode = 'auto_review'): the barber chosen
      -- above is real and holds the time, but the booking is flagged so
      -- reception can confirm or change it.
      if v_worker_id is not null then
        v_auto_assigned := coalesce(v_no_pref_mode, 'auto') = 'auto_review';
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
      (business_id, client_id, service_id, resource_id, worker_id, start_time, end_time, status, notes, price, price_usd, parking_resource_id, worker_auto_assigned, no_preference_pool)
    values
      (v_business_id, v_client_id, p_service_id, p_resource_id, v_worker_id, p_start_time, v_end_time, 'pending', nullif(trim(p_notes), ''), v_price, v_price_usd, v_parking_resource_id, v_auto_assigned, v_pool)
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

-- ============ OPTIONAL PART 4: move existing provisional bookings ============
-- NOT run with the rest (commented out). Bookings created before the pool
-- (scripts/116/117) still hold the barber the system picked provisionally
-- (worker_auto_assigned = true), which keeps showing the "Apartado" mark in
-- that barber's column and blocks their time. Uncomment and run ONCE, after
-- switching the business to the pool, to move the still-pending ones into the
-- pool (no barber, no time held). Completed/cancelled bookings are not touched.
--
-- update public.reservations
-- set worker_id = null,
--     no_preference_pool = true,
--     worker_auto_assigned = false
-- where worker_auto_assigned = true
--   and status in ('pending', 'confirmed')
--   and start_time > now();
