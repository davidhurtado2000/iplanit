-- Buffer time (prep/cleanup) around appointments. Two nullable-in-spirit but
-- not-null-in-storage minute columns on services - default 0 so every
-- existing service keeps behaving exactly as before until an owner opts in.
--
-- Buffers are enforced purely as an availability-computation concern (like
-- Cal.com's event buffers), not a new DB exclusion constraint - the existing
-- reservations_no_overlap constraint (script 012) still only guards the raw
-- [start_time, end_time) interval, so two reservations can never literally
-- overlap, but a slot inside another service's buffer zone would otherwise
-- look "free". Both busy-range construction sites (get_public_busy_times
-- here, and the reservation-modal client-side equivalent) expand each
-- EXISTING reservation's busy window by that reservation's own service's
-- buffer_before_min/buffer_after_min. generateAvailableSlots (lib/availability.ts)
-- then also expands the CANDIDATE slot being checked by the service being
-- booked's own buffer - this bidirectional expansion is what actually makes
-- buffers mutual: a service with no buffer configured still won't get booked
-- inside another service's cleanup window, and a service that needs cleanup
-- after itself won't get scheduled right before someone else's appointment
-- either, regardless of which side "caused" the buffer requirement.

alter table public.services
  add column if not exists buffer_before_min integer not null default 0;

alter table public.services
  add column if not exists buffer_after_min integer not null default 0;

alter table public.services
  drop constraint if exists services_buffer_before_check;
alter table public.services
  add constraint services_buffer_before_check check (buffer_before_min >= 0);

alter table public.services
  drop constraint if exists services_buffer_after_check;
alter table public.services
  add constraint services_buffer_after_check check (buffer_after_min >= 0);

-- get_public_services (scripts 028/034/037) now also reports the service's
-- own buffer minutes, so the public booking page can fold them into its own
-- slot search the same way the internal reservation modal does.
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
      'buffer_before_min', s.buffer_before_min,
      'buffer_after_min', s.buffer_after_min,
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

-- get_public_busy_times (script 028) now expands every returned interval by
-- that specific reservation's own service's buffer minutes, instead of
-- returning the raw [start_time, end_time). A service with no resource
-- requirement can't reach here anyway (p_resource_id null matches no rows),
-- same behavior as before.
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
    json_build_object(
      'start_time', r.start_time - (coalesce(s.buffer_before_min, 0) || ' minutes')::interval,
      'end_time', r.end_time + (coalesce(s.buffer_after_min, 0) || ' minutes')::interval
    )
  ), '[]'::json)
  from public.reservations r
  join public.services s on s.id = r.service_id
  where r.business_id = p_business_id
    and r.resource_id = p_resource_id
    and r.status <> 'cancelled'
    and r.start_time < p_to
    and r.end_time > p_from;
$$;
