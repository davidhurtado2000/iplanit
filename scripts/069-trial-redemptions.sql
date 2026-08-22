-- Persists which emails and which card fingerprints have already redeemed a
-- free trial, so the abuse check survives even if the original account gets
-- deleted (auth.users.email uniqueness alone doesn't cover that case). Only
-- ever written/read by the Stripe webhook and checkout route, both using the
-- service-role client - no policies are granted to 'authenticated'/'anon',
-- same posture as the column-level REVOKE on profiles.plan in
-- scripts/049-stripe-billing.sql.

create table public.trial_redemptions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  -- Null until the checkout.session.completed webhook resolves the
  -- subscription's default payment method - never blocks granting the
  -- trial itself if that lookup fails for any reason.
  card_fingerprint text,
  stripe_customer_id text not null,
  stripe_subscription_id text not null,
  created_at timestamptz not null default now()
);

create index trial_redemptions_email_idx on public.trial_redemptions (lower(email));
create index trial_redemptions_fingerprint_idx on public.trial_redemptions (card_fingerprint) where card_fingerprint is not null;

alter table public.trial_redemptions enable row level security;

-- has_used_trial() lets app/api/stripe/checkout/route.ts (which runs with
-- the logged-in user's own session, not service role) answer "has this
-- email already had a trial?" without ever exposing the table itself -
-- same reasoning as is_platform_admin() in scripts/065-blog.sql. Needs an
-- explicit execute grant even though it's security definer - a direct
-- table policy alone isn't enough once a function is called straight from
-- client code via supabase.rpc() instead of only from inside another RLS
-- policy (see scripts/066-blog-admin-check-fix.sql for the same lesson
-- learned the first time).
create or replace function public.has_used_trial(p_email text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.trial_redemptions where lower(email) = lower(p_email)
  );
$$;

revoke all on function public.has_used_trial(text) from public;
grant execute on function public.has_used_trial(text) to authenticated;
