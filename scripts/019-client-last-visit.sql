-- Extends client_reservation_counts with the client's most recent
-- non-cancelled reservation, so the Clients page can show "last visit"
-- and flag inactive clients without pulling full reservation history
-- per client (which would break the bounded reservation window pattern).

create or replace view public.client_reservation_counts
with (security_invoker = true) as
select
  client_id,
  business_id,
  count(*) filter (where status <> 'cancelled') as reservation_count,
  count(*) filter (where status = 'confirmed') as confirmed_count,
  max(start_time) filter (where status <> 'cancelled') as last_reservation_at
from public.reservations
group by client_id, business_id;
