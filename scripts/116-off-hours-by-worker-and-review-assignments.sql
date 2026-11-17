-- "Fuera de horario" by the BARBER's schedule, and "Sin preferencia ->
-- asignar y revisar" (Carppone, 2026-11-17). Builds on scripts/114 and 115.
--
-- Run it in the PARTS below, one at a time, ideally when the shop is quiet:
-- the ALTER TABLEs take short locks on reservations, and running everything
-- in one go while the app is busy hit a deadlock with scripts/115.
--
-- 1) Off hours: an appointment is "fuera de horario" when its START time is
--    outside the worker's own schedule (worker_hours, with Semanas A/B), or
--    the worker doesn't work that day; a worker with no custom schedule
--    follows the business hours. A cut that starts before closing is
--    normal even if it ends later. The DB decides it (a trigger), so the
--    flag is right whichever way the booking was created or changed - the
--    app only mirrors it for display (lib/off-hours.ts).
-- 2) businesses.no_preference_mode: 'auto' (as always: the public link
--    assigns the least busy free barber) or 'auto_review' (same, but the
--    booking is flagged worker_auto_assigned so reception can confirm or
--    change the barber). The time is held by a real barber either way, so
--    there is no overbooking.

-- =========================== PART 1: columns ===============================
alter table public.businesses
  add column if not exists no_preference_mode text not null default 'auto';
alter table public.businesses drop constraint if exists businesses_no_preference_mode_check;
alter table public.businesses add constraint businesses_no_preference_mode_check
  check (no_preference_mode in ('auto', 'auto_review'));

alter table public.reservations
  add column if not exists worker_auto_assigned boolean not null default false;

-- ===================== PART 2: off-hours rule + triggers ===================
create or replace function public.reservation_is_off_hours(
  p_business_id uuid,
  p_worker_id uuid,
  p_start timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text;
  v_local timestamp;
  v_date date;
  v_dow int;
  v_time time;
  v_open time;
  v_close time;
  v_closed boolean;
begin
  if p_worker_id is null then
    return false;
  end if;
  select timezone into v_tz from public.businesses where id = p_business_id;
  if v_tz is null then
    return false;
  end if;

  v_local := p_start at time zone v_tz;
  v_date := v_local::date;
  v_dow := extract(dow from v_local)::int;
  v_time := v_local::time;

  if exists (select 1 from public.worker_hours where worker_id = p_worker_id) then
    -- The worker has their own schedule: no row for that weekday (or that
    -- week, for Semanas A/B) means they don't work that day.
    select open_time, close_time, is_closed into v_open, v_close, v_closed
    from public.worker_hours
    where worker_id = p_worker_id
      and day_of_week = v_dow
      and (week_rotation is null or week_rotation = public.week_parity(v_date))
    order by (week_rotation is null)
    limit 1;
    if not found then
      return true;
    end if;
  else
    select open_time, close_time, is_closed into v_open, v_close, v_closed
    from public.business_hours
    where business_id = p_business_id and day_of_week = v_dow;
    if not found then
      -- Business hours never configured: the rule can't apply.
      return exists (select 1 from public.business_hours where business_id = p_business_id);
    end if;
  end if;

  if coalesce(v_closed, false) then
    return true;
  end if;
  return v_time < v_open or v_time >= v_close;
end;
$$;

create or replace function public.set_reservation_off_hours()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.off_hours := coalesce(new.type = 'booking', true)
    and public.reservation_is_off_hours(new.business_id, new.worker_id, new.start_time);
  return new;
end;
$$;

-- Named so it sorts BEFORE reservations_snapshot_worker_pay (triggers of the
-- same event fire alphabetically): the pay snapshot must see the final flag.
drop trigger if exists reservations_set_off_hours on public.reservations;
create trigger reservations_set_off_hours
  before insert or update of start_time, worker_id, type on public.reservations
  for each row execute function public.set_reservation_off_hours();

-- Same snapshot as scripts/115, plus: completing an appointment settles who
-- did it, so the "review the barber" flag is cleared; and it also re-runs
-- when start_time changes (the off-hours flag may flip).
create or replace function public.snapshot_worker_pay()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  w record;
  b record;
  v_service_pct numeric(5,2);
begin
  if new.status <> 'completed' or new.worker_id is null then
    return new;
  end if;
  new.worker_auto_assigned := false;
  if tg_op = 'UPDATE'
     and old.worker_id is not distinct from new.worker_id
     and old.service_id is not distinct from new.service_id
     and old.off_hours is not distinct from new.off_hours
     and new.worker_pay_pct is not null then
    return new;
  end if;

  select pay_type, commission_pct into w from public.workers where id = new.worker_id;
  select tip_worker_pct, pay_excludes_tax, off_hours_commission_pct into b
    from public.businesses where id = new.business_id;
  select worker_commission_pct into v_service_pct from public.services where id = new.service_id;

  new.worker_pay_pct := case
    when w.pay_type = 'salary' then 0
    when w.pay_type = 'commission' then coalesce(
      v_service_pct,
      case when new.off_hours then b.off_hours_commission_pct end,
      w.commission_pct
    )
    else null
  end;
  if new.worker_pay_pct is null then
    new.tip_worker_pct := null;
    new.pay_excludes_tax := null;
  else
    new.tip_worker_pct := b.tip_worker_pct;
    new.pay_excludes_tax := b.pay_excludes_tax;
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_snapshot_worker_pay on public.reservations;
create trigger reservations_snapshot_worker_pay
  before insert or update of status, worker_id, service_id, off_hours, start_time on public.reservations
  for each row execute function public.snapshot_worker_pay();

revoke all on function public.reservation_is_off_hours(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.set_reservation_off_hours() from public, anon, authenticated;
revoke all on function public.snapshot_worker_pay() from public, anon, authenticated;

-- ============ PART 3: public booking flags "Sin preferencia" ===============
-- scripts/107's create_public_reservation, unchanged except that a barber
-- picked automatically for "Sin preferencia" is flagged when the business
-- uses no_preference_mode = 'auto_review'.
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
      (business_id, client_id, service_id, resource_id, worker_id, start_time, end_time, status, notes, price, price_usd, parking_resource_id, worker_auto_assigned)
    values
      (v_business_id, v_client_id, p_service_id, p_resource_id, v_worker_id, p_start_time, v_end_time, 'pending', nullif(trim(p_notes), ''), v_price, v_price_usd, v_parking_resource_id, v_auto_assigned)
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
