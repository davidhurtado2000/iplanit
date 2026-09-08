-- Recurring series (script 020) could only repeat "these weekdays, every
-- week" - no way to represent a client who comes every OTHER week. Adds an
-- interval so the occurrence generator (reservation-modal.tsx) can skip
-- weeks that aren't a multiple of it away from the series' own first week.
-- Defaults to 1 (every week), so every existing series keeps behaving
-- exactly as before this column existed - no backfill needed.

alter table public.reservation_series
  add column if not exists interval_weeks int not null default 1 check (interval_weeks > 0);
