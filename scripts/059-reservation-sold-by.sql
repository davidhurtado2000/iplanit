-- Tracks who booked/sold a reservation, separate from worker_id (who
-- performs the service, scripts/057-staff-module.sql). Example: at an
-- academy, a sales rep books a class taught by a teacher - worker_id is the
-- teacher, sold_by is the rep. Set automatically from the logged-in staff
-- user at creation time (see reservation-modal.tsx) - never a manual field,
-- so it adds no friction to booking. References auth.users directly (not
-- business_members) because the owner can sell reservations too and has no
-- business_members row of their own. Nullable: reservations made through
-- the public booking page (app/reservar/[slug]) have no staff session and
-- stay null, same as anything created before this migration.
--
-- No RLS policy changes needed - scripts/025-operational-tables-staff-
-- access.sql's is_business_accessible(business_id) policies are row-level,
-- already covering any column on reservations/reservation_series.
alter table public.reservations
  add column if not exists sold_by uuid references auth.users(id) on delete set null;

create index if not exists reservations_sold_by_idx on public.reservations(sold_by);

alter table public.reservation_series
  add column if not exists sold_by uuid references auth.users(id) on delete set null;

-- Resolves sold_by user ids to display names for the Analytics "por
-- vendedor" breakdown. Can't just SELECT from profiles/business_members
-- directly for this - profiles RLS (scripts/001) only lets a user read
-- their OWN row, so a staff member looking at analytics can't see the
-- owner's name that way, and the owner (who sells reservations too) has no
-- business_members row to read a name from either. security definer lets
-- this bypass both restrictions safely, gated by the same
-- is_business_accessible() check (scripts/052) already used everywhere
-- else a business member needs to read data scoped to their business.
create or replace function public.get_seller_names(target_business_id uuid)
returns table(user_id uuid, name text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, coalesce(nullif(p.full_name, ''), p.email)
  from public.businesses b
  join public.profiles p on p.id = b.owner_id
  where b.id = target_business_id
    and public.is_business_accessible(target_business_id)
  union all
  select bm.user_id, coalesce(nullif(bm.full_name, ''), bm.email)
  from public.business_members bm
  where bm.business_id = target_business_id
    and public.is_business_accessible(target_business_id);
$$;
