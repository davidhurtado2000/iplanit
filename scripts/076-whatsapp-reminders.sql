-- Extends get_reservations_needing_reminders() (latest prior definition:
-- scripts/051-email-visit-type.sql) to also cover clients who have a phone
-- but no email - today's version excludes them entirely (c.email is not
-- null), so they get no reminder at all, by any channel. This is the gap a
-- real trial client reported (older clients without email). Adds
-- client_phone, normalized the same way the public booking dedup already
-- does (scripts/044), so the cron doesn't need its own phone-formatting
-- logic. Keeps the left join on services and reservation_type from 051 -
-- this is a pure addition, not a revert.
--
-- Postgres won't let CREATE OR REPLACE change a function's OUT-parameter
-- row shape (adding client_phone counts as a change) - same reason 051
-- itself had to DROP FUNCTION before redefining this.
drop function if exists public.get_reservations_needing_reminders();

create or replace function public.get_reservations_needing_reminders()
returns table (
  reservation_id uuid,
  client_email text,
  client_phone text,
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
    public.normalize_phone_for_matching(c.phone, b.country),
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
    and (c.email is not null or c.phone is not null)
    and r.start_time > now()
    and r.start_time <= now() + (b.reminder_hours || ' hours')::interval;
$$;

grant execute on function public.get_reservations_needing_reminders() to service_role;
