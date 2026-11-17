-- Two Carppone requests (2026-11-17/18):
--  1) "La ultima cita puede empezar a la hora de cierre": a barber who closes
--     at 8:00 must be bookable AT 8:00 (the appointment may end later).
--     businesses.last_slot_at_close, default false (a spa or clinic still
--     needs the appointment to end by closing time).
--  2) Several services in ONE appointment (tinte + barba): the reservation
--     keeps its main service (reservations.service_id) and the EXTRA services
--     live in reservation_services; reservations.price is the total and
--     end_time already covers the summed duration. The barber's commission is
--     blended by each service's own % at completion (snapshot_worker_pay).
--
-- Run in PARTS, outside the shop's hours, and close Supabase afterwards.

-- ============================== PART 1: tables ===============================
alter table public.businesses
  add column if not exists last_slot_at_close boolean not null default false;

create table if not exists public.reservation_services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  price numeric(10,2),
  price_usd numeric(10,2),
  -- 0 = done within the appointment, adds no agenda time (see the modal).
  duration_minutes integer not null check (duration_minutes >= 0),
  position smallint not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists reservation_services_reservation_idx on public.reservation_services(reservation_id);
create index if not exists reservation_services_business_idx on public.reservation_services(business_id);

alter table public.reservation_services enable row level security;

drop policy if exists "Users can view reservation_services of their business" on public.reservation_services;
create policy "Users can view reservation_services of their business"
  on public.reservation_services for select
  using (public.is_business_accessible(business_id));

drop policy if exists "Users can insert reservation_services to their business" on public.reservation_services;
create policy "Users can insert reservation_services to their business"
  on public.reservation_services for insert
  with check (public.is_business_accessible(business_id));

drop policy if exists "Users can update reservation_services of their business" on public.reservation_services;
create policy "Users can update reservation_services of their business"
  on public.reservation_services for update
  using (public.is_business_accessible(business_id));

drop policy if exists "Users can delete reservation_services of their business" on public.reservation_services;
create policy "Users can delete reservation_services of their business"
  on public.reservation_services for delete
  using (public.is_business_accessible(business_id));

drop policy if exists "Service role can manage reservation_services" on public.reservation_services;
create policy "Service role can manage reservation_services"
  on public.reservation_services for all
  using (auth.role() = 'service_role');

-- New public tables need explicit grants (supabase_explicit_grants).
grant select, insert, update, delete on public.reservation_services to authenticated, service_role;

-- ============ PART 2: last appointment at closing time (functions) ===========
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
  v_last_at_close boolean;
begin
  select w.allows_concurrent_services, b.timezone, b.last_slot_at_close into v_concurrent, v_tz, v_last_at_close
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
       -- Alternating weeks (scripts/108): off on the other group's weeks.
       or (v_hours.week_rotation is not null and public.week_parity(v_local_start::date) <> v_hours.week_rotation)
       or (not v_last_at_close and v_local_end::date <> v_local_start::date)
       or v_local_start::time < v_hours.open_time
       -- businesses.last_slot_at_close (scripts/119): the closing time is the
       -- last START time; otherwise the appointment must END by closing time.
       or (case when v_last_at_close then v_local_start::time > v_hours.close_time
                else v_local_end::time > v_hours.close_time end) then
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
  v_last boolean;
begin
  if p_worker_id is null then
    return false;
  end if;
  select timezone, last_slot_at_close into v_tz, v_last from public.businesses where id = p_business_id;
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
  -- With last_slot_at_close, starting exactly at closing time is still normal.
  return v_time < v_open or (case when v_last then v_time > v_close else v_time >= v_close end);
end;
$$;

create or replace function public.get_public_booking_rules(p_business_id uuid)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object('last_slot_at_close', b.last_slot_at_close)
  from public.businesses b
  where b.id = p_business_id;
$$;

revoke all on function public.get_public_booking_rules(uuid) from public;
grant execute on function public.get_public_booking_rules(uuid) to anon, authenticated;

-- ================== PART 3: commission with several services =================
-- scripts/116's snapshot, now blending each service's own commission by its
-- price share, and re-running when the price changes (extra services change
-- the total). With a single service it behaves exactly as before.
create or replace function public.snapshot_worker_pay()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  w record;
  b record;
  v_service_pct numeric;
  v_primary_pct numeric;
  v_sale numeric;
  v_extras_total numeric := 0;
  v_extras_weighted numeric := 0;
begin
  if new.status <> 'completed' or new.worker_id is null then
    return new;
  end if;
  new.worker_auto_assigned := false;
  new.no_preference_pool := false;
  if tg_op = 'UPDATE'
     and old.worker_id is not distinct from new.worker_id
     and old.service_id is not distinct from new.service_id
     and old.off_hours is not distinct from new.off_hours
     and old.price is not distinct from new.price
     and old.price_usd is not distinct from new.price_usd
     and new.worker_pay_pct is not null then
    return new;
  end if;

  select pay_type, commission_pct into w from public.workers where id = new.worker_id;
  select tip_worker_pct, pay_excludes_tax, off_hours_commission_pct into b
    from public.businesses where id = new.business_id;
  select worker_commission_pct into v_service_pct from public.services where id = new.service_id;

  v_primary_pct := coalesce(v_service_pct, case when new.off_hours then b.off_hours_commission_pct end, w.commission_pct);
  v_sale := coalesce(nullif(new.price, 0), new.price_usd, 0);

  select coalesce(sum(coalesce(nullif(e.price, 0), e.price_usd, 0)), 0),
         coalesce(sum(
           coalesce(nullif(e.price, 0), e.price_usd, 0)
           * coalesce(s.worker_commission_pct, case when new.off_hours then b.off_hours_commission_pct end, w.commission_pct)
         ), 0)
    into v_extras_total, v_extras_weighted
  from public.reservation_services e
  join public.services s on s.id = e.service_id
  where e.reservation_id = new.id;

  new.worker_pay_pct := case
    when w.pay_type = 'salary' then 0
    when w.pay_type = 'commission' then
      case
        when v_extras_total > 0 and v_sale > 0 and v_primary_pct is not null
          then (greatest(v_sale - v_extras_total, 0) * v_primary_pct + v_extras_weighted) / v_sale
        else v_primary_pct
      end
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
  before insert or update of status, worker_id, service_id, off_hours, start_time, price, price_usd on public.reservations
  for each row execute function public.snapshot_worker_pay();

revoke all on function public.snapshot_worker_pay() from public, anon, authenticated;

-- ================== PART 4: the barber's own agenda (extras) ==================
create or replace function public.get_my_worker_agenda(p_worker_id uuid, p_from timestamptz, p_to timestamptz)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(json_agg(json_build_object(
    'id', r.id,
    'start_time', r.start_time,
    'end_time', r.end_time,
    'status', r.status,
    'type', r.type,
    'service_name', s.name,
    'service_color', s.color,
    'client_name', c.name,
    'notes', r.notes,
    'price', r.price,
    'price_usd', r.price_usd,
    'tip_amount', r.tip_amount,
    'worker_pay_pct', r.worker_pay_pct,
    'tip_worker_pct', r.tip_worker_pct,
    'pay_excludes_tax', r.pay_excludes_tax,
    'off_hours', r.off_hours,
    'service_commission_pct', s.worker_commission_pct,
    -- Extra services of the same appointment (scripts/119), for the barber's
    -- own earnings calculation.
    'extras', coalesce((
      select json_agg(json_build_object(
        'name', es.name,
        'price', e.price,
        'price_usd', e.price_usd,
        'commission_pct', es.worker_commission_pct
      ) order by e.position)
      from public.reservation_services e
      join public.services es on es.id = e.service_id
      where e.reservation_id = r.id
    ), '[]'::json)
  ) order by r.start_time), '[]'::json)
  from public.reservations r
  join public.workers w on w.id = r.worker_id
  left join public.services s on s.id = r.service_id
  left join public.clients c on c.id = r.client_id
  where r.worker_id = p_worker_id
    and w.user_id = auth.uid()
    and w.is_active = true
    and p_to > p_from
    and p_to - p_from <= interval '62 days'
    and r.start_time < p_to
    and r.end_time > p_from;
$$;

revoke all on function public.get_my_worker_agenda(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_my_worker_agenda(uuid, timestamptz, timestamptz) to authenticated;
