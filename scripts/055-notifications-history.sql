-- Persisted history for the in-app notification bell (context/
-- notifications-context.tsx, components/dashboard/notification-bell.tsx).
-- The bell's small popover already derives "new reservation" / "client
-- cancelled" / "starting soon" live from whatever's in dashboard-data-
-- context's ±90 day reservations window - that stays exactly as-is.
--
-- "Starting soon" is deliberately NEVER stored here: it's a live fact about
-- the current time vs. a reservation's start_time, not a discrete event -
-- a history of "was starting soon" would be meaningless. Only the two real,
-- one-time events get a permanent row, so the full /dashboard/notifications
-- page can show real history beyond the bell's short-lived window.
--
-- Written via a trigger (not an application-level call at each mutation
-- site, unlike the email-notification flow in lib/email/notify.ts which
-- has to call an external API and so lives in the app layer) - this is a
-- pure DB-internal write, and reservations already have multiple insert
-- paths (staff dashboard, public booking RPC) that a trigger guarantees
-- coverage for without each one needing to remember to log it, matching
-- the existing check_reservation_limit()-style trigger pattern (scripts/052).

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  type text not null check (type in ('new_reservation', 'client_cancelled')),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists notifications_business_id_created_at_idx
  on public.notifications(business_id, created_at desc);

alter table public.notifications enable row level security;

-- Same read access as the reservations these rows describe. No insert/
-- update/delete policy for authenticated users on purpose - rows are only
-- ever written by the security-definer trigger function below, the same
-- "no direct client writes" pattern already used for business_members
-- (scripts/024).
drop policy if exists "Users can view notifications of their business" on public.notifications;
create policy "Users can view notifications of their business"
  on public.notifications for select
  using (public.is_business_accessible(business_id));

drop policy if exists "Service role can manage notifications" on public.notifications;
create policy "Service role can manage notifications"
  on public.notifications for all
  using (auth.role() = 'service_role');

create or replace function public.log_reservation_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.notifications (business_id, type, reservation_id)
    values (new.business_id, 'new_reservation', new.id);
  elsif TG_OP = 'UPDATE' then
    -- Only a client-initiated cancellation (cancel_public_reservation,
    -- scripts/031) is notification-worthy - staff cancelling their own
    -- reservation from the dashboard (cancelled_by = 'business') shouldn't
    -- notify the staff about their own action.
    if new.status = 'cancelled'
       and old.status is distinct from 'cancelled'
       and new.cancelled_by = 'client' then
      insert into public.notifications (business_id, type, reservation_id)
      values (new.business_id, 'client_cancelled', new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_notify_insert on public.reservations;
create trigger reservations_notify_insert
  after insert on public.reservations
  for each row execute function public.log_reservation_notification();

drop trigger if exists reservations_notify_update on public.reservations;
create trigger reservations_notify_update
  after update on public.reservations
  for each row execute function public.log_reservation_notification();

-- Prevents the same event from ever being logged twice (belt-and-suspenders
-- alongside the trigger's own old/new checks) and doubles as the conflict
-- target for the one-time backfill below. Postgres has no "ADD CONSTRAINT
-- IF NOT EXISTS" (unlike ADD COLUMN), so drop-then-add the same way
-- scripts/052 handles a re-run of this file.
alter table public.notifications
  drop constraint if exists notifications_reservation_id_type_key;
alter table public.notifications
  add constraint notifications_reservation_id_type_key unique (reservation_id, type);

-- One-time backfill so the new /dashboard/notifications history page isn't
-- empty on day one - only the trigger covers everything from here forward,
-- so this fills in the last 30 days of activity that happened before this
-- script ever ran. Safe to re-run this whole file: on conflict do nothing
-- means running it twice never creates duplicates.
insert into public.notifications (business_id, type, reservation_id, created_at)
select business_id, 'new_reservation', id, created_at
from public.reservations
where created_at > now() - interval '30 days'
on conflict (reservation_id, type) do nothing;

insert into public.notifications (business_id, type, reservation_id, created_at)
select business_id, 'client_cancelled', id, cancelled_at
from public.reservations
where status = 'cancelled'
  and cancelled_by = 'client'
  and cancelled_at is not null
  and cancelled_at > now() - interval '30 days'
on conflict (reservation_id, type) do nothing;
