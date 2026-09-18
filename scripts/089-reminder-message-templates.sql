-- Lets a business customize the human message line in its reminder email
-- and the manual WhatsApp reminder text (reservation-modal.tsx's
-- "Recordatorio por WhatsApp" button) - both currently hardcoded. One
-- column each, not a per-language pair: a business only ever sends in the
-- one language its own country already implies (see the
-- business_country ? 'en' : 'es' branching in
-- app/api/cron/send-reminders/route.ts), so there's nothing to pick
-- between. Null means "use the default wording" - a business opts in for
-- real by typing something, it's never left holding an empty required
-- field.
--
-- Same {client}/{service}/{date}/{time}/{business} placeholder vocabulary
-- the WhatsApp template (context/language-context.tsx's
-- whatsappReminderMessage) already used - reused here as ONE shared token
-- set across both channels rather than two different ones to learn.
alter table public.businesses
  add column if not exists reminder_email_message text,
  add column if not exists reminder_whatsapp_message text;

-- Widens get_reservations_needing_reminders (latest prior definition:
-- scripts/081-group-reservations.sql) so the cron route gets a business's
-- custom email message with the rest of the row, no extra query needed.
-- reminder_whatsapp_message is deliberately NOT added here - the cron
-- route's WhatsApp channel only ever sends Twilio's own hosted Content
-- Template (a separate system, out of scope); the manual wa.me link is
-- dashboard-only and reads reminder_whatsapp_message directly off
-- currentBusiness there.
--
-- Postgres won't let CREATE OR REPLACE change a function's OUT-parameter
-- row shape (adding a column counts as a change) - same reason every
-- prior redefinition of this function had to DROP FUNCTION first.
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
  reminder_email_message text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    r.id, c.email, public.normalize_phone_for_matching(c.phone, b.country), c.name,
    s.name, r.type, b.name, b.timezone, b.country, r.start_time, true, b.reminder_email_message
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

  select
    r.id, ac.email, public.normalize_phone_for_matching(ac.phone, b.country), ac.name,
    s.name, r.type, b.name, b.timezone, b.country, r.start_time, false, b.reminder_email_message
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
    and r.start_time <= now() + (b.reminder_hours || ' hours')::interval;
$$;

grant execute on function public.get_reservations_needing_reminders() to service_role;
