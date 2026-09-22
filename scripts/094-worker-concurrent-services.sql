-- "This worker can handle several services at the same time" - a co-founder
-- suggestion (e.g. a hairdresser who also oversees a color processing, or a
-- trainer running two overlapping classes). Off by default: every worker
-- keeps today's single-booking-at-a-time behavior unless explicitly opted
-- in. reservation-modal.tsx's three worker-conflict checks (the client-side
-- slot-suggestion busy ranges, the single create/edit save-time check, and
-- the recurring-series per-occurrence check) all skip entirely for a worker
-- with this set - there's no DB-level exclusion constraint for worker_id to
-- also update (see that file's own comment on why not: only resource_id
-- has one, scripts 012/035).
alter table public.workers
  add column if not exists allows_concurrent_services boolean not null default false;

comment on column public.workers.allows_concurrent_services is
  'When true, this worker can be booked into overlapping reservations - the double-booking guards in reservation-modal.tsx skip this worker entirely. Off by default.';
