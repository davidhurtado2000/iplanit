-- SECURITY FIX (2026-11-20): public client lookup leaked personal data.
--
-- scripts/099 added find_public_client_match so the public booking page could
-- offer "are you Juan?" while someone typed. It is executable by `anon` (the
-- public key every visitor has), had no rate limit, and returned the matched
-- client's NAME, EMAIL and PHONE. Anyone could therefore turn a phone number
-- into a person's name and email at a business (or an email into a phone),
-- with no limit on attempts.
--
-- The page no longer calls it (the autofill was removed). This script makes the
-- function itself harmless, for two reasons:
--   * pages already open or cached in someone's browser still carry the old
--     code and would keep calling it until they reload;
--   * so it must stay callable without errors, but never read a table again.
-- It always answers "no match", exactly what the page shows when nobody is
-- found, so an old page simply behaves as if the client were new.
--
-- The booking itself still recognizes returning clients on the server
-- (create_public_reservation); that is unchanged.
--
-- Safe and instant: one function replace, no tables touched. It can be run at
-- any time, including during opening hours.

create or replace function public.find_public_client_match(
  p_slug text,
  p_email text default null,
  p_phone text default null,
  p_document_number text default null
)
returns json
language sql
immutable
set search_path = public
as $$
  select json_build_object('match', false);
$$;

revoke all on function public.find_public_client_match(text, text, text, text) from public;
grant execute on function public.find_public_client_match(text, text, text, text) to anon, authenticated;
