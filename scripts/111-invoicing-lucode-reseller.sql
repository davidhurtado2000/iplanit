-- Electronic invoicing, part 2: Lucode (API SUNAT) as the provider, the
-- reseller model, per-plan limits and monthly usage. Builds on
-- scripts/110-electronic-invoicing.sql and is safe to run whether or not 110
-- has been run before (run 110 first, then this one).
--
-- What changed since 110 (decision of November 2026, see
-- docs/plan-facturacion-electronica.md):
--   - Provider is Lucode, not Nubefact. iPlanit holds ONE reseller account;
--     each business (RUC) is a company inside it with its own token, which
--     iPlanit stores encrypted. The business no longer pastes a URL/token.
--   - Pricing: the add-on is required on every plan. Basic/Pro pay +$10
--     (500 docs/month), Premium pays +$5 (1,000 docs/month, so Premium with
--     invoicing is $45). Over the limit, emission keeps working and the
--     overage is billed at $10 per 500 docs. All of this lives in
--     invoicing_plan_config so it can change without a deploy.
--   - Unpaid subscriptions already drop profiles.plan to 'free' (Stripe
--     webhook), and 'free' has no row in invoicing_plan_config, so emission
--     stops on its own until the business pays.

-- ============================================================
-- 1. Settings: provider, mode, fiscal address, provider company
-- ============================================================
alter table public.business_invoicing_settings
  drop constraint if exists business_invoicing_settings_provider_check;
alter table public.business_invoicing_settings
  add constraint business_invoicing_settings_provider_check
  check (provider in ('lucode', 'nubefact', 'mock'));
alter table public.business_invoicing_settings
  alter column provider set default 'lucode';

-- 'managed' = the company lives in iPlanit's reseller account (default).
-- 'own_provider' = the business connects its own account (not built yet,
-- kept so the column doesn't have to change later).
alter table public.business_invoicing_settings
  add column if not exists mode text not null default 'managed';
alter table public.business_invoicing_settings
  drop constraint if exists business_invoicing_settings_mode_check;
alter table public.business_invoicing_settings
  add constraint business_invoicing_settings_mode_check
  check (mode in ('managed', 'own_provider'));

-- In the managed model the API URL comes from the server environment and the
-- token arrives after the company is registered with Lucode, so neither is
-- known when the row is first created.
alter table public.business_invoicing_settings alter column api_url drop not null;
alter table public.business_invoicing_settings alter column api_token_encrypted drop not null;

alter table public.business_invoicing_settings
  add column if not exists provider_company_id text,
  add column if not exists direccion_fiscal text,
  -- INEI ubigeo of the fiscal address, e.g. 150122 = Miraflores, Lima.
  add column if not exists ubigeo text;

alter table public.business_invoicing_settings
  drop constraint if exists business_invoicing_settings_ubigeo_check;
alter table public.business_invoicing_settings
  add constraint business_invoicing_settings_ubigeo_check
  check (ubigeo is null or ubigeo ~ '^\d{6}$');

-- Emission can only be switched on once there is a token to emit with.
alter table public.business_invoicing_settings
  drop constraint if exists business_invoicing_settings_enabled_needs_token;
alter table public.business_invoicing_settings
  add constraint business_invoicing_settings_enabled_needs_token
  check (not enabled or api_token_encrypted is not null);

-- ============================================================
-- 2. Invoices: provider id and environment
-- ============================================================
alter table public.invoices
  add column if not exists provider_document_id text,
  -- Copied from the settings at emission time. Demo comprobantes never reach
  -- SUNAT and never count toward the monthly limit.
  add column if not exists environment text not null default 'demo';
alter table public.invoices
  drop constraint if exists invoices_environment_check;
alter table public.invoices
  add constraint invoices_environment_check
  check (environment in ('demo', 'production'));

create index if not exists invoices_business_env_created_idx
  on public.invoices(business_id, environment, created_at);

-- The retry cron also polls 'sent' comprobantes (received by the provider,
-- still waiting for SUNAT), which 110's retry index doesn't cover.
create index if not exists invoices_poll_idx
  on public.invoices(next_retry_at)
  where status in ('pending', 'sent');

-- ============================================================
-- 3. Per-plan limits (pricing as data, not code)
-- ============================================================
create table if not exists public.invoicing_plan_config (
  plan text primary key check (plan in ('basic', 'pro', 'premium')),
  included_docs int not null check (included_docs >= 0),
  -- true = the business must buy the add-on; false = included in the plan.
  addon_required boolean not null,
  overage_block_size int not null default 500 check (overage_block_size > 0),
  overage_block_price_usd numeric(8,2) not null default 10 check (overage_block_price_usd >= 0),
  updated_at timestamptz not null default now()
);

-- Monthly price of the add-on on this plan (shown in the UI; the charge
-- itself is a Stripe Price per plan).
alter table public.invoicing_plan_config
  add column if not exists addon_price_usd numeric(8,2) not null default 10
  check (addon_price_usd >= 0);

-- Re-running this script resets the plan prices and limits to these values.
-- Superseded by scripts/112 (invoicing is Premium-only): run 112 again after
-- re-running this one.
insert into public.invoicing_plan_config (plan, included_docs, addon_required, addon_price_usd)
values ('basic', 500, true, 10), ('pro', 500, true, 10), ('premium', 1000, true, 5)
on conflict (plan) do update
  set included_docs = excluded.included_docs,
      addon_required = excluded.addon_required,
      addon_price_usd = excluded.addon_price_usd,
      updated_at = now();

alter table public.invoicing_plan_config enable row level security;

-- Prices aren't secret (they're on the landing page).
drop policy if exists "Anyone can read invoicing plan config" on public.invoicing_plan_config;
create policy "Anyone can read invoicing plan config"
  on public.invoicing_plan_config for select
  using (true);

drop policy if exists "Service role can manage invoicing plan config" on public.invoicing_plan_config;
create policy "Service role can manage invoicing plan config"
  on public.invoicing_plan_config for all
  using (auth.role() = 'service_role');

-- ============================================================
-- 4. Access: Peru + a plan that has invoicing + add-on when required
-- ============================================================
create or replace function public.business_has_invoicing_access(p_business_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((
    select b.country = 'PE'
      and c.plan is not null
      and (
        not c.addon_required
        or p.invoicing_addon_override
        or p.invoicing_addon_active
        or (p.invoicing_addon_access_until is not null and p.invoicing_addon_access_until > now())
      )
    from public.businesses b
    join public.profiles p on p.id = b.owner_id
    -- get_business_plan already maps billing_exempt to 'premium'.
    left join public.invoicing_plan_config c on c.plan = public.get_business_plan(b.id)
    where b.id = p_business_id
  ), false);
$$;

-- ============================================================
-- 5. Monthly usage (calendar month in Lima, all sedes of the same owner)
-- ============================================================
-- The limit belongs to the subscription, and one subscription (owner) can
-- have several sedes, so usage adds up every business of that owner.
-- Counts production comprobantes that reached the provider (credit notes
-- included, since the provider counts them too).
create or replace function public.get_invoicing_usage(p_business_id uuid)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_owner uuid;
  v_plan text;
  v_config public.invoicing_plan_config;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_used int;
  v_over int;
  v_blocks int;
begin
  if auth.role() is distinct from 'service_role'
     and not public.is_business_accessible(p_business_id) then
    return json_build_object('error', 'not_accessible');
  end if;

  select owner_id into v_owner from public.businesses where id = p_business_id;
  if v_owner is null then
    return json_build_object('error', 'not_found');
  end if;

  v_plan := public.get_business_plan(p_business_id);
  select * into v_config from public.invoicing_plan_config where plan = v_plan;

  v_month_start := date_trunc('month', now() at time zone 'America/Lima') at time zone 'America/Lima';
  v_month_end := (date_trunc('month', now() at time zone 'America/Lima') + interval '1 month') at time zone 'America/Lima';

  select count(*) into v_used
  from public.invoices i
  join public.businesses b on b.id = i.business_id
  where b.owner_id = v_owner
    and i.environment = 'production'
    and i.status in ('sent', 'accepted', 'rejected', 'voided')
    and i.created_at >= v_month_start
    and i.created_at < v_month_end;

  if v_config.plan is null then
    return json_build_object(
      'plan', v_plan,
      'used', v_used,
      'included', 0,
      'period_start', v_month_start,
      'period_end', v_month_end
    );
  end if;

  v_over := greatest(v_used - v_config.included_docs, 0);
  v_blocks := ceil(v_over::numeric / v_config.overage_block_size)::int;

  return json_build_object(
    'plan', v_plan,
    'used', v_used,
    'included', v_config.included_docs,
    'percent', case when v_config.included_docs = 0 then null
                    else round(v_used * 100.0 / v_config.included_docs) end,
    'overage_docs', v_over,
    'overage_blocks', v_blocks,
    'overage_usd', v_blocks * v_config.overage_block_price_usd,
    'period_start', v_month_start,
    'period_end', v_month_end
  );
end;
$$;

-- ============================================================
-- 6. Dashboard read of the settings (replaces 110's version)
-- ============================================================
create or replace function public.get_invoicing_settings(p_business_id uuid)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text;
  v_settings public.business_invoicing_settings;
  v_country text;
begin
  if not public.is_business_accessible(p_business_id) then
    return json_build_object('error', 'not_accessible');
  end if;

  v_role := coalesce(public.business_member_role(p_business_id), '');
  select country into v_country from public.businesses where id = p_business_id;
  select * into v_settings from public.business_invoicing_settings where business_id = p_business_id;

  if v_role not in ('owner', 'admin') then
    return json_build_object(
      'available', v_country = 'PE',
      'has_access', public.business_has_invoicing_access(p_business_id),
      'configured', v_settings.business_id is not null,
      'enabled', coalesce(v_settings.enabled, false),
      'auto_emit', coalesce(v_settings.auto_emit, false)
    );
  end if;

  return json_build_object(
    'available', v_country = 'PE',
    'has_access', public.business_has_invoicing_access(p_business_id),
    'configured', v_settings.business_id is not null,
    'enabled', coalesce(v_settings.enabled, false),
    'auto_emit', coalesce(v_settings.auto_emit, false),
    'settings', case when v_settings.business_id is null then null else json_build_object(
      'provider', v_settings.provider,
      'mode', v_settings.mode,
      'environment', v_settings.environment,
      'token_configured', v_settings.api_token_encrypted is not null,
      'provider_registered', v_settings.provider_company_id is not null,
      'ruc', v_settings.ruc,
      'razon_social', v_settings.razon_social,
      'direccion_fiscal', v_settings.direccion_fiscal,
      'ubigeo', v_settings.ubigeo,
      'serie_factura', v_settings.serie_factura,
      'serie_boleta', v_settings.serie_boleta,
      'serie_nc_factura', v_settings.serie_nc_factura,
      'serie_nc_boleta', v_settings.serie_nc_boleta,
      'prices_include_igv', v_settings.prices_include_igv,
      'igv_affectation', v_settings.igv_affectation,
      'igv_rate', v_settings.igv_rate,
      'updated_at', v_settings.updated_at
    ) end,
    'business_tax_id', (select tax_id from public.businesses where id = p_business_id)
  );
end;
$$;

-- ============================================================
-- 7. Going from demo to production
-- ============================================================
-- Demo and production share the (RUC, series) counter, so tests in demo
-- would push the first real number to e.g. B001-15. Called once when a
-- business switches to production: removes its demo comprobantes and resets
-- every counter of that RUC that has no production comprobante yet.
create or replace function public.clear_demo_invoices(p_ruc text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  -- Credit notes first: they point at the originals.
  delete from public.invoices where ruc = p_ruc and environment = 'demo' and doc_type = '07';
  delete from public.invoices where ruc = p_ruc and environment = 'demo';
  get diagnostics v_deleted = row_count;

  delete from public.invoice_series_counters c
  where c.ruc = p_ruc
    and not exists (
      select 1 from public.invoices i
      where i.ruc = c.ruc and i.serie = c.serie
    );

  return json_build_object('success', true, 'deleted', v_deleted);
end;
$$;

-- ============================================================
-- 8. Grants
-- ============================================================
revoke all on function public.get_invoicing_usage(uuid) from public, anon;
grant execute on function public.get_invoicing_usage(uuid) to authenticated, service_role;

revoke all on function public.get_invoicing_settings(uuid) from public, anon;
grant execute on function public.get_invoicing_settings(uuid) to authenticated;

revoke all on function public.business_has_invoicing_access(uuid) from public, anon, authenticated;
grant execute on function public.business_has_invoicing_access(uuid) to service_role;

revoke all on function public.clear_demo_invoices(text) from public, anon, authenticated;
grant execute on function public.clear_demo_invoices(text) to service_role;
