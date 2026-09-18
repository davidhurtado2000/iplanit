-- Pricing overhaul, Phase 2: a second, automatic reminder for Pro/Premium
-- businesses, sent a few hours before the appointment ("el dia de la
-- reserva" in David's tier spec) - on top of whatever single reminder
-- (reminder_hours, business-configurable) every tier already gets. Basic
-- stays at just the one reminder it already had. No new Settings toggle -
-- this is automatic based on plan, the same way Pro/Premium already get a
-- bigger resource cap without a switch to flip.
--
-- Tracked with its OWN sent-at column, independent of reminder_sent_at -
-- a reservation needs both to fire independently (a business might set
-- reminder_hours to something short enough that ordering between the two
-- isn't guaranteed, which is fine - the goal is more touchpoints for
-- higher tiers, not a strict sequence).
alter table public.reservations
  add column if not exists day_of_reminder_sent_at timestamptz;

-- Fixed threshold (not a Settings-configurable one like reminder_hours) -
-- keeps this simple and clearly a "bonus" reminder rather than a second
-- knob to explain. 3 hours: comfortably same-day for any normal business
-- day, and distinct from the existing reminder_hours choices (1/2/24/48)
-- often enough in practice not to feel redundant.
--
-- Widens get_reservations_needing_reminders (latest prior definition:
-- scripts/090-basic-tier-rename.sql) with a reminder_kind discriminator
-- ('main' | 'day_of') so the cron route's existing single loop handles
-- both kinds, writing to the right sent-at column per row. Adding the
-- column means dropping first, same as every prior redefinition of this
-- function.
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
    and r.start_time <= now() + interval '3 hours';
$$;

grant execute on function public.get_reservations_needing_reminders() to service_role;
