-- "Visitas": a prospective client who wants to see the place before
-- booking. Modeled as a reservation with type = 'visit' instead of a new
-- table, since it shares almost all the same mechanics (client, time slot,
-- optional resource, status workflow, calendar, overlap checking) - a
-- separate table would duplicate that entire stack for no benefit. A visit
-- doesn't have to be tied to a specific service (someone may just want to
-- see the place in general), so service_id becomes nullable.

alter table public.reservations
  alter column service_id drop not null;

alter table public.reservations
  add column if not exists type text not null default 'booking' check (type in ('booking', 'visit'));

-- No changes needed to reservations_no_overlap (script 012) or
-- get_public_busy_times (script 028) - neither references service_id, so a
-- resource-linked visit still correctly blocks that time slot.
