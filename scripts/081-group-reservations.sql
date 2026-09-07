-- Group/multi-attendee reservations (staff-created only, from the internal
-- dashboard - a client still self-books 1:1 via the public link exactly as
-- today). One reservations row per class occurrence, client_id stays the
-- primary/first attendee, unchanged - this join table holds everyone else.
-- Deliberately NOT touched by this feature: reservations_no_overlap
-- (scripts/012, 035), get_public_busy_times, generateAvailableSlots,
-- create_public_reservation - a group reservation is still exactly one row
-- to all of those, just with extra people attached.

alter table public.services
  add column if not exists max_attendees integer null;

alter table public.services
  drop constraint if exists services_max_attendees_check;
alter table public.services
  add constraint services_max_attendees_check check (max_attendees is null or max_attendees >= 1);

create table if not exists public.reservation_attendees (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  -- Denormalized, same convention as every other operational table (see
  -- scripts/025-operational-tables-staff-access.sql) - RLS checks this
  -- directly instead of joining through reservations.
  business_id uuid not null references public.businesses(id) on delete cascade,
  -- 'cancelled' lets one attendee be removed from a group without
  -- cancelling the whole reservation (see reservation-modal.tsx).
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (reservation_id, client_id)
);

create index if not exists reservation_attendees_reservation_idx on public.reservation_attendees(reservation_id);
create index if not exists reservation_attendees_client_idx on public.reservation_attendees(client_id);

alter table public.reservation_attendees enable row level security;

drop policy if exists "Users can view reservation_attendees of their business" on public.reservation_attendees;
create policy "Users can view reservation_attendees of their business"
  on public.reservation_attendees for select
  using (public.is_business_accessible(business_id));

drop policy if exists "Users can insert reservation_attendees to their business" on public.reservation_attendees;
create policy "Users can insert reservation_attendees to their business"
  on public.reservation_attendees for insert
  with check (public.is_business_accessible(business_id));

drop policy if exists "Users can update reservation_attendees of their business" on public.reservation_attendees;
create policy "Users can update reservation_attendees of their business"
  on public.reservation_attendees for update
  using (public.is_business_accessible(business_id));

drop policy if exists "Users can delete reservation_attendees of their business" on public.reservation_attendees;
create policy "Users can delete reservation_attendees of their business"
  on public.reservation_attendees for delete
  using (public.is_business_accessible(business_id));

-- Widen get_public_reservation_status (scripts/051-email-visit-type.sql)
-- with a confirmed-attendees array, so both the public manage page and the
-- notification route (app/api/notifications/reservation) can see everyone
-- who should be emailed, without a second RPC.
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
    'notify_cancellations', b.notify_cancellations,
    'attendees', (
      select coalesce(json_agg(json_build_object('name', ac.name, 'email', ac.email)), '[]'::json)
      from public.reservation_attendees ra
      join public.clients ac on ac.id = ra.client_id
      where ra.reservation_id = r.id and ra.status = 'confirmed'
    )
  )
  from public.reservations r
  join public.clients c on c.id = r.client_id
  left join public.services s on s.id = r.service_id
  join public.businesses b on b.id = r.business_id
  where r.id = p_reservation_id;
$$;

revoke all on function public.get_public_reservation_status(uuid) from public;
grant execute on function public.get_public_reservation_status(uuid) to anon, authenticated;

-- Widen get_reservations_needing_reminders (scripts/076-whatsapp-reminders.sql)
-- with one extra row per confirmed attendee, UNIONed onto the existing
-- primary-client row, same shape, same reservation_id - the cron route's
-- existing per-row loop then naturally reaches every recipient with zero
-- new looping logic there (app/api/cron/send-reminders still needs a small
-- fix so reminder_sent_at is only written once per reservation, not once
-- per attendee row - see that file).
--
-- Postgres won't let create-or-replace change a function's OUT columns
-- (adding is_primary below) - same issue script 051 already hit once
-- before for this exact function, same fix: drop it first.
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
  -- False for an attendee row (scripts/081) - the cron route omits the
  -- manage/cancel link for those, since that page cancels the WHOLE
  -- reservation and only the primary contact should hold that link.
  is_primary boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    r.id, c.email, public.normalize_phone_for_matching(c.phone, b.country), c.name,
    s.name, r.type, b.name, b.timezone, b.country, r.start_time, true
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
    s.name, r.type, b.name, b.timezone, b.country, r.start_time, false
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
