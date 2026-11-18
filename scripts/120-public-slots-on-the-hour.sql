-- Carppone (2026-11-18): they always schedule clients on the hour, so the
-- public booking link should offer 11:00, 12:00, 1:00... and not the :30
-- times, while the dashboard still lets staff book half hours.
-- businesses.public_slots_on_the_hour, default false (other businesses keep
-- offering every 30 minutes). Only the PUBLIC page filters; nothing is
-- enforced server-side on purpose (it is a presentation choice, not a rule).
--
-- Safe and fast: one column plus a function replace. Run outside the shop's hours.

alter table public.businesses
  add column if not exists public_slots_on_the_hour boolean not null default false;

create or replace function public.get_public_booking_rules(p_business_id uuid)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
    'last_slot_at_close', b.last_slot_at_close,
    'public_slots_on_the_hour', b.public_slots_on_the_hour
  )
  from public.businesses b
  where b.id = p_business_id;
$$;

revoke all on function public.get_public_booking_rules(uuid) from public;
grant execute on function public.get_public_booking_rules(uuid) to anon, authenticated;
