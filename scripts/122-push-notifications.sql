-- Phone notifications (Web Push): a notice on the staff's phone/computer when
-- a client books from the public link or cancels, even with the app closed.
--
-- Two small tables, nothing else changes:
--   push_subscriptions: one row per device that turned the notices on. The
--     browser hands us an endpoint + two keys; the server uses them to push.
--   push_event_log: one row per (reservation, event) already announced, so a
--     retried request or a leaked reservation id can never trigger the same
--     notice twice (max one "new" and one "cancelled" per reservation).
--
-- No triggers and no extension: the notices are sent from the app's own
-- server routes, so the database does no extra work (it is the fragile part).
-- Run outside the shop's hours, then close Supabase.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users see their own push subscriptions" on public.push_subscriptions;
create policy "Users see their own push subscriptions"
  on public.push_subscriptions for select
  using (user_id = auth.uid());

drop policy if exists "Users delete their own push subscriptions" on public.push_subscriptions;
create policy "Users delete their own push subscriptions"
  on public.push_subscriptions for delete
  using (user_id = auth.uid());

-- Writes go through the app's own routes (service role), which check the
-- session first; there is deliberately no insert/update policy for browsers.
grant select, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;

create table if not exists public.push_event_log (
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  kind text not null check (kind in ('new', 'cancelled')),
  created_at timestamptz not null default now(),
  primary key (reservation_id, kind)
);

-- Row level security with no policies: only the service role can touch it.
alter table public.push_event_log enable row level security;
grant select, insert, delete on public.push_event_log to service_role;
