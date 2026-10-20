-- Google/Apple Calendar sync (V1, ICS feed, no OAuth) - see the Google
-- Calendar sync conversation. Each worker gets a stable random token; the
-- token itself is the feed's only access control (same convention Google
-- Calendar's own "secret address in iCal format" uses), since calendar apps
-- fetch these URLs on their own schedule with no way to send an auth header.
-- Free on every plan (David's call) - this is booking-reliability hygiene,
-- not a business-insight feature like the Premium-gated analytics.
--
-- gen_random_uuid() is volatile, so this ALTER rewrites the table and
-- evaluates a fresh random value per existing row, not one shared value.
alter table public.workers
  add column calendar_feed_token uuid not null default gen_random_uuid();

alter table public.workers
  add constraint workers_calendar_feed_token_key unique (calendar_feed_token);

-- No RLS/grant changes: the dashboard reads this column through the same
-- existing authenticated-role policy that already covers the rest of a
-- workers row (scripts/032/052's business_member_role check), and the
-- public feed endpoint (app/api/calendar/[token]/route.ts) looks it up with
-- the service-role key, bypassing RLS entirely - the token is the auth, not
-- a database role.
