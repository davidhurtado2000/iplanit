-- Every transactional email (confirmation, approved, cancellation,
-- reminder) talked about "your booking" and a "Service" row unconditionally
-- - correct for a real booking, actively misleading for a visit (no
-- service being delivered, sometimes no service at all). Neither RPC these
-- emails are built from exposed reservations.type, so lib/email/templates.ts
-- had no way to know which copy to use. Both fixed below; templates.ts
-- itself now branches on the type these expose.

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
    'reservation_type', r.type,
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

-- Also fixes a real bug found along the way: this used an inner join on
-- services, so any reservation with no service_id (every visit created
-- without one - the common case, see reservation-modal.tsx) silently
-- never matched at all and never got a reminder email, regardless of the
-- business's reminder settings. Now a left join, same as
-- get_public_reservation_status above.
drop function if exists public.get_reservations_needing_reminders();

create or replace function public.get_reservations_needing_reminders()
returns table (
  reservation_id uuid,
  client_email text,
  client_name text,
  service_name text,
  reservation_type text,
  business_name text,
  business_timezone text,
  business_country text,
  start_time timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    r.id,
    c.email,
    c.name,
    s.name,
    r.type,
    b.name,
    b.timezone,
    b.country,
    r.start_time
  from public.reservations r
  join public.clients c on c.id = r.client_id
  left join public.services s on s.id = r.service_id
  join public.businesses b on b.id = r.business_id
  where r.status in ('pending', 'confirmed')
    and r.reminder_sent_at is null
    and b.notify_reminders = true
    and c.email is not null
    and r.start_time > now()
    and r.start_time <= now() + (b.reminder_hours || ' hours')::interval;
$$;

revoke all on function public.get_reservations_needing_reminders() from public;
grant execute on function public.get_reservations_needing_reminders() to service_role;
