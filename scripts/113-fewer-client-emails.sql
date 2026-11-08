-- Fewer, more useful emails to clients (decision of 2026-11-08, to stay
-- within Resend's free plan: 3,000/month and 100/day). Run after 112.
--
-- 1. Reminders skip what was just booked:
--    - the main reminder is skipped when the reservation was made inside
--      its own window (booked 5 hours before with reminder_hours = 24): the
--      confirmation email already did that job;
--    - the day-of reminder is skipped when it was booked less than 6 hours
--      before the appointment.
--    (The day-of reminder also stops going by email at all - see
--    app/api/cron/send-reminders/route.ts. Same function signature as 091.)
--
-- 2. The Google review request ("thanks for your visit") goes at most once
--    every 180 days per client, instead of after every single visit, and
--    only one per client per run.

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
  start_time timestamptz,
  is_primary boolean,
  reminder_email_message text,
  reminder_kind text
)
language sql
security definer
stable
set search_path = public
as $$
  -- Main reminder, primary contact.
  select
    r.id, c.email, public.normalize_phone_for_matching(c.phone, b.country), c.name,
    s.name, r.type, b.name, b.timezone, b.country, r.start_time, true, b.reminder_email_message, 'main'
  from public.reservations r
  join public.clients c on c.id = r.client_id
  left join public.services s on s.id = r.service_id
  join public.businesses b on b.id = r.business_id
  where r.status in ('pending', 'confirmed')
    and r.reminder_sent_at is null
    and b.notify_reminders = true
    and (c.email is not null or c.phone is not null)
    and r.start_time > now()
    and r.start_time <= now() + (b.reminder_hours || ' hours')::interval
    and r.created_at <= r.start_time - (b.reminder_hours || ' hours')::interval

  union all

  -- Main reminder, group attendees.
  select
    r.id, ac.email, public.normalize_phone_for_matching(ac.phone, b.country), ac.name,
    s.name, r.type, b.name, b.timezone, b.country, r.start_time, false, b.reminder_email_message, 'main'
  from public.reservations r
  join public.reservation_attendees ra on ra.reservation_id = r.id and ra.status = 'confirmed'
  join public.clients ac on ac.id = ra.client_id
  left join public.services s on s.id = r.service_id
  join public.businesses b on b.id = r.business_id
  where r.status in ('pending', 'confirmed')
    and r.reminder_sent_at is null
    and b.notify_reminders = true
    and (ac.email is not null or ac.phone is not null)
    and r.start_time > now()
    and r.start_time <= now() + (b.reminder_hours || ' hours')::interval
    and r.created_at <= r.start_time - (b.reminder_hours || ' hours')::interval

  union all

  -- Day-of reminder, Pro/Premium only, primary contact.
  select
    r.id, c.email, public.normalize_phone_for_matching(c.phone, b.country), c.name,
    s.name, r.type, b.name, b.timezone, b.country, r.start_time, true, b.reminder_email_message, 'day_of'
  from public.reservations r
  join public.clients c on c.id = r.client_id
  left join public.services s on s.id = r.service_id
  join public.businesses b on b.id = r.business_id
  where r.status in ('pending', 'confirmed')
    and r.day_of_reminder_sent_at is null
    and b.notify_reminders = true
    and public.get_business_plan(r.business_id) in ('pro', 'premium')
    and (c.email is not null or c.phone is not null)
    and r.start_time > now()
    and r.start_time <= now() + interval '3 hours'
    and r.created_at <= r.start_time - interval '6 hours'

  union all

  -- Day-of reminder, Pro/Premium only, group attendees.
  select
    r.id, ac.email, public.normalize_phone_for_matching(ac.phone, b.country), ac.name,
    s.name, r.type, b.name, b.timezone, b.country, r.start_time, false, b.reminder_email_message, 'day_of'
  from public.reservations r
  join public.reservation_attendees ra on ra.reservation_id = r.id and ra.status = 'confirmed'
  join public.clients ac on ac.id = ra.client_id
  left join public.services s on s.id = r.service_id
  join public.businesses b on b.id = r.business_id
  where r.status in ('pending', 'confirmed')
    and r.day_of_reminder_sent_at is null
    and b.notify_reminders = true
    and public.get_business_plan(r.business_id) in ('pro', 'premium')
    and (ac.email is not null or ac.phone is not null)
    and r.start_time > now()
    and r.start_time <= now() + interval '3 hours'
    and r.created_at <= r.start_time - interval '6 hours';
$$;

grant execute on function public.get_reservations_needing_reminders() to service_role;

-- Same rules as 101 (after the visit, within 14 days, business has its
-- Google link) plus: no request to this client in the last 180 days, and
-- one per client per run (distinct on) so two visits in the same window
-- don't both send.
create or replace function public.get_reservations_needing_review_request()
returns table (
  reservation_id uuid,
  client_email text,
  client_name text,
  business_name text,
  google_review_url text
)
language sql
security definer
stable
set search_path = public
as $$
  select distinct on (r.client_id)
    r.id, c.email, c.name, b.name, b.google_review_url
  from public.reservations r
  join public.clients c on c.id = r.client_id
  join public.businesses b on b.id = r.business_id
  where r.status in ('confirmed', 'completed')
    and r.review_requested_at is null
    and b.google_review_url is not null
    and c.email is not null
    and r.end_time <= now() - interval '3 hours'
    and r.end_time > now() - interval '14 days'
    and not exists (
      select 1
      from public.reservations prev
      where prev.client_id = r.client_id
        and prev.review_requested_at > now() - interval '180 days'
    )
  order by r.client_id, r.end_time desc
$$;

grant execute on function public.get_reservations_needing_review_request() to service_role;
