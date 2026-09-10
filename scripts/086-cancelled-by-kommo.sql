-- Widens cancelled_by (scripts/031) to a third value, 'kommo' - a
-- cancellation that came from the Kommo webhook (a lead marked Lost)
-- shouldn't be recorded as 'business' (implies staff cancelled it
-- themselves in iPlanit) or 'client' (implies the client cancelled their
-- own booking, which also feeds the late-cancellation policy stats and the
-- "client cancelled" bell/history notification - neither is true here).
-- Distinguishing it lets the live dashboard toast use its own message and
-- sound instead of the generic cancellation one, so a lost sale doesn't
-- read the same as a normal cancellation.
--
-- Looks up the existing check constraint by inspecting pg_constraint
-- instead of assuming it's named reservations_cancelled_by_check (the
-- default Postgres would give it from script 031's unnamed inline check,
-- but not guaranteed if it was ever touched by hand) - guessing wrong and
-- silently no-op'ing the drop would leave the OLD 2-value constraint
-- active alongside a new one, still rejecting 'kommo'.
do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'public.reservations'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%cancelled_by%';

  if v_constraint_name is not null then
    execute format('alter table public.reservations drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table public.reservations
  add constraint reservations_cancelled_by_check check (cancelled_by in ('client', 'business', 'kommo'));
