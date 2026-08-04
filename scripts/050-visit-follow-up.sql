-- Links a booking created as a direct follow-up from a visit (see the
-- "Create follow-up booking" action in reservation-modal.tsx), so a future
-- "visit -> booking conversion rate" report is possible without guessing
-- from client + rough timing alone. Nullable and self-referencing - never
-- required, only ever set by that one action.
alter table public.reservations
  add column if not exists follow_up_of_reservation_id uuid references public.reservations(id) on delete set null;

create index if not exists idx_reservations_follow_up_of
  on public.reservations(follow_up_of_reservation_id)
  where follow_up_of_reservation_id is not null;
