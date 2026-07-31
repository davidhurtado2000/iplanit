-- Email notifications (confirmation, cancellation, reminder), now that a
-- verified sending domain exists (Resend). Sending itself happens in the
-- Next.js app (API routes), not in Postgres - this script only adds the
-- storage this feature needs: per-business toggles/preferences, and a
-- reminder_sent_at marker so the reminder cron never double-sends.

alter table public.businesses
  add column if not exists notify_confirmations boolean not null default true;

alter table public.businesses
  add column if not exists notify_cancellations boolean not null default true;

alter table public.businesses
  add column if not exists notify_reminders boolean not null default true;

alter table public.businesses
  add column if not exists reminder_hours integer not null default 24;

alter table public.businesses
  drop constraint if exists businesses_reminder_hours_check;
alter table public.businesses
  add constraint businesses_reminder_hours_check check (reminder_hours > 0 and reminder_hours <= 168);

alter table public.reservations
  add column if not exists reminder_sent_at timestamptz;

-- get_public_business (scripts 028/035) now also reports whether the
-- business wants confirmation emails sent, so the public booking page knows
-- whether to call the send-notification API after a successful booking.
-- offers_parking (added in script 035) is preserved here - CREATE OR
-- REPLACE fully overwrites the function body, so every field from every
-- prior version has to be carried forward explicitly or it silently
-- disappears from the response.
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
    'notify_confirmations', notify_confirmations
  )
  from public.businesses
  where slug = p_slug
  limit 1;
$$;

-- get_public_reservation_status (scripts 031/036) now also returns the
-- client's own email (they already gave it at booking time - this is their
-- own reservation, looked up by its own id) and both notification
-- preferences, so app/reservar/cita/[id] and the /api/notifications route
-- can send a confirmation/cancellation email without a second round trip.
-- has_parking (script 036) and the left join for services (visits have no
-- service_id) are carried forward from that version.
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

-- Cross-tenant by design (scans every business's upcoming reservations at
-- once) for the reminder cron job - this must never be callable by anon or
-- authenticated, only the service role (which bypasses grants entirely, but
-- revoking public/authenticated here is the explicit guarantee that a
-- regular logged-in user can never call this and see every other business's
-- client emails).
create or replace function public.get_reservations_needing_reminders()
returns table (
  reservation_id uuid,
  client_email text,
  client_name text,
  service_name text,
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
    b.name,
    b.timezone,
    b.country,
    r.start_time
  from public.reservations r
  join public.clients c on c.id = r.client_id
  join public.services s on s.id = r.service_id
  join public.businesses b on b.id = r.business_id
  where r.status in ('pending', 'confirmed')
    and r.reminder_sent_at is null
    and b.notify_reminders = true
    and c.email is not null
    and r.start_time > now()
    and r.start_time <= now() + (b.reminder_hours || ' hours')::interval;
$$;

revoke all on function public.get_public_business(text) from public;
revoke all on function public.get_public_reservation_status(uuid) from public;
revoke all on function public.get_reservations_needing_reminders() from public;

grant execute on function public.get_public_business(text) to anon, authenticated;
grant execute on function public.get_public_reservation_status(uuid) to anon, authenticated;
grant execute on function public.get_reservations_needing_reminders() to service_role;
