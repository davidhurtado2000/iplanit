-- Links a profile to its Stripe Customer/Subscription so the webhook
-- (app/api/webhooks/stripe/route.ts) can look up which account a Stripe
-- event belongs to and keep profiles.plan in sync automatically.

alter table public.profiles
  add column if not exists stripe_customer_id text;

alter table public.profiles
  add column if not exists stripe_subscription_id text;

create unique index if not exists profiles_stripe_customer_id_idx
  on public.profiles(stripe_customer_id)
  where stripe_customer_id is not null;

-- profiles.plan now has real financial consequences via Stripe, but the
-- existing "Users can update own profile" policy (script 001) allows a
-- logged-in user to update ANY column on their own row, including plan
-- itself - meaning anyone could already call
-- supabase.from('profiles').update({ plan: 'premium' }) directly and
-- self-grant Premium, bypassing the app UI entirely. This was always
-- technically possible, it just didn't matter financially until now.
-- Column-level privileges close this without touching the row-level
-- policy: authenticated users keep full access to their own row for
-- every other column (name, avatar, timezone, language), just not these.
-- Only the service role (used exclusively by the Stripe webhook and other
-- server-only routes) can still write them.
revoke update (plan, stripe_customer_id, stripe_subscription_id)
  on public.profiles from authenticated;
