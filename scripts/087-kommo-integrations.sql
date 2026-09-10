-- Kommo phase 2 - each iPlanit BUSINESS connects its own Kommo account via
-- OAuth2 (unlike phase 1's single shared test account gated by
-- KOMMO_TEST_BUSINESS_ID in env). One row per business that has ever
-- connected; access/refresh tokens are stored encrypted (lib/kommo/
-- encryption.ts) - unlike phase 1's token, which only ever lived in
-- .env.local, this table is reachable by anyone with database access.
--
-- kommo_account_id is how the webhook (which only ever gets an account_id
-- in its payload, never a business_id) finds which business a given
-- Kommo event belongs to - see the updated webhook route.
create table if not exists public.kommo_integrations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  subdomain text not null,
  kommo_account_id text not null,
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  -- Kommo access tokens last 24h (not 1 year like phase 1's manually
  -- generated one) - every real API call must check this first and
  -- refresh proactively, not just react to a 401.
  token_expires_at timestamptz not null,
  -- Custom-field ids for the built-in PHONE/EMAIL contact fields, and the
  -- enum ids for their "MOB"/"PRIV" options - these are auto-generated
  -- per Kommo ACCOUNT, not universal constants (phase 1's hardcoded ones
  -- in lib/kommo/client.ts only ever worked because there was only one
  -- account). Discovered once via GET /contacts/custom_fields right after
  -- connecting (see the callback route) and cached here so every
  -- findOrCreateContact call doesn't re-fetch them.
  phone_field_id text,
  phone_enum_id text,
  email_field_id text,
  email_enum_id text,
  status text not null default 'active' check (status in ('active', 'error', 'disconnected')),
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id),
  unique (kommo_account_id)
);

create index if not exists kommo_integrations_account_id_idx on public.kommo_integrations(kommo_account_id);

alter table public.kommo_integrations enable row level security;

-- Same "owner reads, service role writes" split already used by
-- reservation_series (scripts/020) and every other business-scoped table -
-- the OAuth flow and every sync/webhook call runs server-side with the
-- service-role client, never as the logged-in user.
drop policy if exists "Owner can view their own kommo integration" on public.kommo_integrations;
create policy "Owner can view their own kommo integration"
  on public.kommo_integrations for select
  using (business_id in (select id from public.businesses where owner_id = auth.uid()));

drop policy if exists "Service role can manage kommo integrations" on public.kommo_integrations;
create policy "Service role can manage kommo integrations"
  on public.kommo_integrations for all
  using (auth.role() = 'service_role');
