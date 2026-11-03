-- Time blocks: lunch breaks, unexpected closures, a barber's day off -
-- for the whole business, one worker, or one resource. Blocking Diego
-- never touches Carlos's availability. One-off (a date range, all-day or
-- hours) or weekly (e.g. Mon-Fri 13:00-14:00 lunch).
--
-- Enforced on the public link (busy-time RPCs + create_public_reservation
-- + worker_can_take_booking). In the dashboard blocks are shown and
-- skipped in slot suggestions, but staff can still book manually - they
-- may know better (e.g. a client who insists on coming during lunch).

create table if not exists public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  -- Both null = whole business. At most one is set.
  worker_id uuid references public.workers(id) on delete cascade,
  resource_id uuid references public.resources(id) on delete cascade,
  -- One-off block: an exact instant range (all-day ranges are stored as
  -- business-local midnight to midnight by the app).
  starts_at timestamptz,
  ends_at timestamptz,
  -- Weekly block: these weekdays (0 = Sunday), between start_time and
  -- end_time business-local (both null = all day), from repeat_from until
  -- repeat_until (null = no end).
  repeat_weekdays smallint[],
  start_time time,
  end_time time,
  repeat_from date,
  repeat_until date,
  reason text check (reason is null or char_length(reason) <= 120),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint time_blocks_single_target check (worker_id is null or resource_id is null),
  constraint time_blocks_shape check (
    (
      repeat_weekdays is null
      and starts_at is not null and ends_at is not null and starts_at < ends_at
    ) or (
      repeat_weekdays is not null
      and cardinality(repeat_weekdays) > 0
      and repeat_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
      and repeat_from is not null
      and (repeat_until is null or repeat_until >= repeat_from)
      and ((start_time is null and end_time is null) or (start_time is not null and end_time is not null and start_time < end_time))
    )
  )
);

create index if not exists time_blocks_business_idx on public.time_blocks(business_id);

alter table public.time_blocks enable row level security;

drop policy if exists "Users can view time blocks of their business" on public.time_blocks;
create policy "Users can view time blocks of their business"
  on public.time_blocks for select
  using (public.is_business_accessible(business_id));

drop policy if exists "Owner/admin can insert time blocks" on public.time_blocks;
create policy "Owner/admin can insert time blocks"
  on public.time_blocks for insert
  with check (public.business_member_role(business_id) in ('owner', 'admin'));

drop policy if exists "Owner/admin can update time blocks" on public.time_blocks;
create policy "Owner/admin can update time blocks"
  on public.time_blocks for update
  using (public.business_member_role(business_id) in ('owner', 'admin'));

drop policy if exists "Owner/admin can delete time blocks" on public.time_blocks;
create policy "Owner/admin can delete time blocks"
  on public.time_blocks for delete
  using (public.business_member_role(business_id) in ('owner', 'admin'));

-- Required since 2026-10-30: Supabase no longer auto-grants new tables.
grant select, insert, update, delete on public.time_blocks to authenticated, service_role;

-- Every block occurrence overlapping [p_from, p_to), with weekly blocks
-- expanded into concrete instants in the business's own timezone (so a
-- 13:00 lunch stays 13:00 across DST changes). Internal - only called from
-- other security-definer functions, never granted to anon/authenticated.
-- Same expansion rules as lib/time-blocks.ts (the dashboard's copy).
create or replace function public.time_block_ranges(p_business_id uuid, p_from timestamptz, p_to timestamptz)
returns table (block_id uuid, worker_id uuid, resource_id uuid, start_at timestamptz, end_at timestamptz, reason text)
language sql
security definer
stable
set search_path = public
as $$
  with biz as (
    select timezone as tz from public.businesses where id = p_business_id
  ),
  occurrences as (
    select tb.id, tb.worker_id, tb.resource_id, tb.starts_at as start_at, tb.ends_at as end_at, tb.reason
    from public.time_blocks tb
    where tb.business_id = p_business_id
      and tb.repeat_weekdays is null
      and tb.starts_at < p_to
      and tb.ends_at > p_from

    union all

    select
      tb.id, tb.worker_id, tb.resource_id,
      (d::date + coalesce(tb.start_time, time '00:00')) at time zone biz.tz,
      case
        when tb.end_time is null then ((d::date + 1) + time '00:00') at time zone biz.tz
        else (d::date + tb.end_time) at time zone biz.tz
      end,
      tb.reason
    from public.time_blocks tb
    cross join biz
    cross join lateral generate_series(
      greatest(tb.repeat_from, (p_from at time zone biz.tz)::date - 1)::timestamp,
      least(coalesce(tb.repeat_until, (p_to at time zone biz.tz)::date + 1), (p_to at time zone biz.tz)::date + 1)::timestamp,
      interval '1 day'
    ) as d
    where tb.business_id = p_business_id
      and tb.repeat_weekdays is not null
      and extract(dow from d)::smallint = any(tb.repeat_weekdays)
  )
  select * from occurrences o
  where o.start_at < p_to and o.end_at > p_from;
$$;

revoke all on function public.time_block_ranges(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- get_public_busy_times (latest prior: scripts/040) - also returns blocks:
-- business-wide ones always (even with no resource, so services without
-- resources still respect a closure), and this resource's own.
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
  select coalesce(json_agg(json_build_object('start_time', x.start_time, 'end_time', x.end_time)), '[]'::json)
  from (
    select
      r.start_time - (coalesce(s.buffer_before_min, 0) || ' minutes')::interval as start_time,
      r.end_time + (coalesce(s.buffer_after_min, 0) || ' minutes')::interval as end_time
    from public.reservations r
    join public.services s on s.id = r.service_id
    where r.business_id = p_business_id
      and r.resource_id = p_resource_id
      and r.status <> 'cancelled'
      and r.start_time < p_to
      and r.end_time > p_from

    union all

    select b.start_at, b.end_at
    from public.time_block_ranges(p_business_id, p_from, p_to) b
    where (b.worker_id is null and b.resource_id is null)
       or (p_resource_id is not null and b.resource_id = p_resource_id)
  ) x;
$$;

revoke all on function public.get_public_busy_times(uuid, uuid, timestamptz, timestamptz) from public;
grant execute on function public.get_public_busy_times(uuid, uuid, timestamptz, timestamptz) to anon, authenticated;

-- get_public_worker_busy_times (latest prior: scripts/102) - also returns
-- that worker's blocks and business-wide ones (blocks apply even to a
-- worker who can take several services at once).
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
  select coalesce(json_agg(json_build_object('start_time', x.start_time, 'end_time', x.end_time)), '[]'::json)
  from (
    select
      r.start_time - (coalesce(s.buffer_before_min, 0) || ' minutes')::interval as start_time,
      r.end_time + (coalesce(s.buffer_after_min, 0) || ' minutes')::interval as end_time
    from public.reservations r
    left join public.services s on s.id = r.service_id
    join public.workers w on w.id = r.worker_id
    where r.business_id = p_business_id
      and r.worker_id = p_worker_id
      and w.allows_concurrent_services = false
      and r.status <> 'cancelled'
      and r.start_time < p_to
      and r.end_time > p_from

    union all

    select b.start_at, b.end_at
    from public.time_block_ranges(p_business_id, p_from, p_to) b
    where b.worker_id = p_worker_id
       or (b.worker_id is null and b.resource_id is null)
  ) x;
$$;

revoke all on function public.get_public_worker_busy_times(uuid, uuid, timestamptz, timestamptz) from public;
grant execute on function public.get_public_worker_busy_times(uuid, uuid, timestamptz, timestamptz) to anon, authenticated;

-- worker_can_take_booking (latest prior: scripts/102) - adds the block check.
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

  -- Time blocks (scripts/107) apply even to a worker who can take several
  -- services at once - lunch is lunch.
  if exists (
    select 1 from public.time_block_ranges(p_business_id, p_start, p_end) b
    where b.start_at < p_end and b.end_at > p_start
      and (b.worker_id = p_worker_id or (b.worker_id is null and b.resource_id is null))
  ) then
    return false;
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

-- create_public_reservation (latest prior: scripts/102) - same signature,
-- adds: business-wide/resource blocks reject the slot ('time_blocked'), and
-- the auto-assigned resource skips blocked ones.
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
