-- Clients page showed "N reservas" per client by filtering the *entire*
-- reservations array client-side (and a second KPI counting distinct
-- clients with a confirmed reservation, same way). Both broke the moment
-- the app started loading only a bounded window of recent reservations
-- (see dashboard-data-context.tsx) - a client's real lifetime count needs
-- an actual aggregate query, not a derived count from whatever happens to
-- be loaded in the browser.
--
-- security_invoker makes this view enforce the SAME RLS policies as the
-- underlying reservations table for whoever queries it (Postgres 15+,
-- which Supabase runs) - without it, a view runs with its creator's
-- privileges instead of the caller's, which would let any authenticated
-- user pass an arbitrary business_id filter and read another business's
-- client counts. Same class of bug as the IDOR fixed earlier this project.

create or replace view public.client_reservation_counts
with (security_invoker = true) as
select
  client_id,
  business_id,
  count(*) filter (where status <> 'cancelled') as reservation_count,
  count(*) filter (where status = 'confirmed') as confirmed_count
from public.reservations
group by client_id, business_id;
