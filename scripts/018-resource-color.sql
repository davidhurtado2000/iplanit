-- Resource column headers in the calendar's day view all rendered in the
-- same flat muted-foreground grey, since there was no per-resource color to
-- draw from (unlike services, which already have one). This gives resources
-- the same color field + picker services already have, reused consistently
-- in the calendar headers and the Resources tab cards.

alter table public.resources
  add column if not exists color text default '#3B82F6';
