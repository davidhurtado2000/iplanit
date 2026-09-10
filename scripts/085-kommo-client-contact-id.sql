-- The reservation-level kommo_contact_id/kommo_lead_id (script 084) is only
-- enough for the iPlanit -> Kommo direction: findOrCreateContact matches by
-- searching Kommo's own /contacts?query= every time, so iPlanit never
-- actually remembers which Kommo contact belongs to which client.
--
-- The Kommo -> iPlanit direction needs the reverse lookup: a webhook fires
-- with a Kommo contact_id, and iPlanit needs to know which client that is
-- WITHOUT re-matching by phone/email (fragile - the client may have since
-- edited their phone in Kommo, breaking the match). Storing the link on the
-- client itself (not just the reservation) makes that lookup a plain
-- indexed id match instead of a fuzzy search, and doubles as a fast path
-- for findOrCreateContact on a client's 2nd+ reservation (skip the Kommo
-- search entirely once we already know their contact id).
alter table public.clients
  add column if not exists kommo_contact_id text;

create index if not exists clients_kommo_contact_id_idx on public.clients(kommo_contact_id) where kommo_contact_id is not null;
