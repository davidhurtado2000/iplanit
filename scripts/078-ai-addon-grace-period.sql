-- Deactivating the AI add-on used to cut access off immediately (Stripe's
-- create_prorations default just credits the unused days on the NEXT
-- invoice, invisibly) - decided that's the wrong model for a $7/mo add-on:
-- every subscription product people already know (Netflix, Spotify, a gym)
-- keeps access until the period you already paid for ends, not until you
-- notice a few cents back on a future bill. This column is that grace
-- period's end date.

alter table public.profiles
  add column if not exists ai_addon_access_until timestamptz null;

comment on column public.profiles.ai_addon_access_until is
  'Set by app/api/stripe/ai-addon/deactivate when cancelling - the add-on stays usable until this timestamp even though billing already stopped (see lib/ai-usage-client.ts isAiAddonActive). Cleared back to null on reactivation.';
