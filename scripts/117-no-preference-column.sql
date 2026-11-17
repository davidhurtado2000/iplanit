-- "Sin preferencia" column in the calendar (Carppone, 2026-11-17).
--
-- Display option on top of scripts/116's no_preference_mode = 'auto_review':
-- bookings still flagged worker_auto_assigned show in their own "Sin
-- preferencia" column of the day view instead of the provisional barber's
-- column (which shows a faint "Apartado" hold so reception sees that time
-- is taken). The time is still held by a real barber underneath, so the
-- team is never overbooked; confirming/changing the barber moves the
-- booking to that barber's column.
--
-- Tiny: one column on businesses (a handful of rows). Still, run it outside
-- the shop's hours.

alter table public.businesses
  add column if not exists no_preference_column boolean not null default false;
