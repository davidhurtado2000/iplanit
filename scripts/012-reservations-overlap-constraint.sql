-- Application-level overlap checks race under concurrent requests (two
-- near-simultaneous inserts can both pass the check before either commits).
-- This constraint is the actual source of truth; the app-level check in
-- reservation-modal.tsx is just a fast pre-flight for a better error message.

create extension if not exists btree_gist;

alter table public.reservations
  drop constraint if exists reservations_no_overlap;

alter table public.reservations
  add constraint reservations_no_overlap
  -- start_time/end_time are `timestamp with time zone`, so the range type
  -- must be tstzrange (tsrange is for timestamp without time zone and
  -- errors out with "function tsrange(timestamptz, timestamptz) does not exist").
  exclude using gist (
    resource_id with =,
    tstzrange(start_time, end_time) with &&
  )
  where (status <> 'cancelled' and resource_id is not null);
