-- Lets one worker be staffed at more than one sede of the same org (real
-- trigger: the coworking business the sedes feature itself was built for,
-- scripts/053's own header, has staff who work at both her locations).
--
-- Approach: NOT a shared-identity join table (unlike clients.organization_id,
-- scripts/053) - each sede gets its own fully independent `workers` row (own
-- id, own is_active, own schedule via worker_hours, own service assignments
-- via worker_services), linked only by a shared worker_group_id used purely
-- for cross-sede DISPLAY (badges / "add to sede" chips in
-- app/(dashboard)/dashboard/workers/page.tsx). Mirrors business_members'
-- existing shape (one row per (person, business_id), grouped client-side by
-- identity for display - Settings' Team roster) rather than clients' shape,
-- because a worker's schedule/services genuinely differ per physical
-- location, unlike a client - see scripts/053's own header on why
-- reservations/services/resources/hours/staff were deliberately kept
-- per-sede.
--
-- Zero RLS changes: worker_group_id is never referenced by any policy, so
-- workers/worker_hours/worker_services keep being scoped by their own
-- business_id exactly as scripts/057 set up - every existing policy on all
-- three tables is untouched. Adding a worker to a second sede is a plain
-- client-side insert into `workers` (business_id = the target sede) -
-- already permitted today by "Owner/admin can insert workers" for anyone
-- with owner/admin role at that sede, so no new RPC is needed either.

alter table public.workers
  add column if not exists worker_group_id uuid not null default gen_random_uuid();

-- Note: gen_random_uuid() is volatile, so this ALTER forces a full table
-- rewrite (not the constant-default fast path) - each EXISTING worker row
-- gets its own distinct random group id, i.e. becomes "a group of one" by
-- default. That's exactly what's wanted: no two unrelated pre-existing
-- workers accidentally end up sharing a group.

create index if not exists workers_worker_group_id_idx on public.workers(worker_group_id);

-- Guards against a double-submit race on the "add to sede" chip creating
-- two linked rows for the same person at the same sede - same defensive
-- shape as business_members' unique(business_id, user_id) (scripts/024).
alter table public.workers
  add constraint workers_group_business_unique unique (worker_group_id, business_id);
