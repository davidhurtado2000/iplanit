-- Rate limiting for public, unauthenticated write paths. Before this,
-- create_public_reservation (public booking page) and
-- /api/notifications/reservation (reservation-email trigger) had zero
-- volume limiting - the only thing anywhere near this path was the Free
-- plan's 50-reservations-per-month cap (scripts/048), which is a business
-- quota, not an abuse defense (it doesn't distinguish caller/IP and
-- Premium businesses have no cap at all).
--
-- Two independent, purpose-built ledger tables rather than reusing
-- `reservations`/a notifications table, since neither carries the caller's
-- IP and mixing rate-limit bookkeeping into real business data would put
-- pure abuse-defense noise somewhere a business owner could see or export
-- it. Both are written only by service-role API routes - RLS is enabled
-- with no anon/authenticated policy at all, so nothing else can touch them.

create table if not exists public.public_booking_attempts (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  ip text not null,
  created_at timestamptz not null default now()
);

create index if not exists public_booking_attempts_lookup_idx
  on public.public_booking_attempts(slug, ip, created_at);

alter table public.public_booking_attempts enable row level security;

create policy "Service role can manage public booking attempts"
  on public.public_booking_attempts for all
  using (auth.role() = 'service_role');

create table if not exists public.notification_send_log (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  type text not null,
  created_at timestamptz not null default now()
);

create index if not exists notification_send_log_lookup_idx
  on public.notification_send_log(reservation_id, created_at);

alter table public.notification_send_log enable row level security;

create policy "Service role can manage notification send log"
  on public.notification_send_log for all
  using (auth.role() = 'service_role');
