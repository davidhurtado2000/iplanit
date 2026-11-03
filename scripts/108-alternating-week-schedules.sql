-- Alternating-week schedules ("Semanas A / Semanas B"): a barbershop where
-- one group works Sundays one week and the other group the next. Set once
-- per worker per weekday in Trabajadores -> horario, then it runs by itself
-- - no weekly manual blocking (forgetting one week would put the resting
-- group on the public link). Generic: any weekday, any business.
--
-- week_rotation on a worker_hours row: null = every week (as before),
-- 0 = "Semanas A", 1 = "Semanas B". Which is which comes from
-- week_parity() below - must match lib/availability.ts weekParity().
alter table public.worker_hours
  add column if not exists week_rotation smallint;

alter table public.worker_hours
  drop constraint if exists worker_hours_week_rotation_check;
alter table public.worker_hours
  add constraint worker_hours_week_rotation_check
  check (week_rotation is null or week_rotation in (0, 1));

-- 0 for "Semanas A", 1 for "Semanas B". Weeks run Monday-Sunday, counted
-- from Monday 2024-01-01 (floor, so dates before it still alternate
-- correctly).
create or replace function public.week_parity(p_date date)
returns smallint
language sql
immutable
as $$
  select ((floor((p_date - date '2024-01-01')::numeric / 7)::int % 2 + 2) % 2)::smallint;
$$;

grant execute on function public.week_parity(date) to anon, authenticated, service_role;

-- get_public_workers (latest prior: scripts/102) - hours now carry
-- week_rotation so the public slot picker can skip the resting group.
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
          'is_closed', wh.is_closed,
          'week_rotation', wh.week_rotation
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

-- worker_can_take_booking (latest prior: scripts/107) - a worker on their
-- group's off week can't be booked, even by a direct RPC call.
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
       -- Alternating weeks (scripts/108): off on the other group's weeks.
       or (v_hours.week_rotation is not null and public.week_parity(v_local_start::date) <> v_hours.week_rotation)
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
