-- Kommo CRM sync, phase 1 (proof of concept - single shared Kommo test
-- account, credentials in env vars, see lib/kommo/client.ts). Storing the
-- resulting Kommo contact/lead id directly on the reservation - once set,
-- a retry (network hiccup, someone re-triggering the same request with a
-- leaked reservation id) skips re-syncing instead of creating a duplicate
-- lead in Kommo every time. Also doubles as a future "ver en Kommo" link
-- from the reservation detail, for free.
alter table public.reservations
  add column if not exists kommo_contact_id text,
  add column if not exists kommo_lead_id text;
