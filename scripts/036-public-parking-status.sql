-- get_public_reservation_status (script 031) didn't report whether a
-- parking spot was assigned - create_public_reservation (script 035)
-- already blocks the whole booking if a requested spot isn't available, so
-- reaching this page with a reservation at all means any parking request
-- on it succeeded. Without this, the client had no way to confirm they
-- actually got a spot when checking "Gestiona tu cita" later - the whole
-- point of the feature is reassurance, so leaving that unconfirmed defeated
-- it. Same args, so this is a plain CREATE OR REPLACE.
create or replace function public.get_public_reservation_status(p_reservation_id uuid)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
    'id', r.id,
    'status', r.status,
    'start_time', r.start_time,
    'client_name', c.name,
    'service_name', s.name,
    'business_name', b.name,
    'business_timezone', b.timezone,
    'cancellation_policy_hours', b.cancellation_policy_hours,
    'has_parking', r.parking_resource_id is not null
  )
  from public.reservations r
  join public.clients c on c.id = r.client_id
  left join public.services s on s.id = r.service_id
  join public.businesses b on b.id = r.business_id
  where r.id = p_reservation_id;
$$;
