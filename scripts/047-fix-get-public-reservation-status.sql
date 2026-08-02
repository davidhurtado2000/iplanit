-- The live version of get_public_reservation_status in Supabase had drifted
-- from script 041's definition - it was missing both `notify_confirmations`
-- and `has_parking` from its json_build_object, while still including
-- `client_email`/`notify_cancellations`. That's exactly why confirmation and
-- approved emails silently never sent while cancellation emails worked: the
-- notifications API route read `reservation.notify_confirmations` as
-- `undefined` (falsy) since the key didn't exist in the response at all,
-- even though the businesses table itself correctly stored `true`. This is
-- a plain re-run of 041's function body, restoring every field explicitly
-- so there's nothing left to silently drop.
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
    'client_email', c.email,
    'service_name', s.name,
    'business_name', b.name,
    'business_timezone', b.timezone,
    'cancellation_policy_hours', b.cancellation_policy_hours,
    'has_parking', r.parking_resource_id is not null,
    'notify_confirmations', b.notify_confirmations,
    'notify_cancellations', b.notify_cancellations
  )
  from public.reservations r
  join public.clients c on c.id = r.client_id
  left join public.services s on s.id = r.service_id
  join public.businesses b on b.id = r.business_id
  where r.id = p_reservation_id;
$$;

revoke all on function public.get_public_reservation_status(uuid) from public;
grant execute on function public.get_public_reservation_status(uuid) to anon, authenticated;
