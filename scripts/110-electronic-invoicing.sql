-- Electronic invoicing (SUNAT boletas/facturas via a PSE, Nubefact first) -
-- an opt-in add-on for paid plans, Peru-only. Asked for by a business moving
-- over from Viutify: they won't switch unless they can issue comprobantes from
-- iPlanit when a service is completed. Full plan: docs/plan-facturacion-electronica.md.
--
-- The BUSINESS is always the issuer (its own RUC); iPlanit only builds the
-- data and sends it to the business's PSE account. Every provider call runs
-- server-side with the service role - nothing here is written by the browser.
--
-- Reuses what already exists instead of duplicating it:
--   - clients.document_type / document_number (scripts/029) for DNI/RUC/etc.
--   - businesses.tax_id (scripts/022) only as the prefill for settings.ruc.

-- ============================================================
-- 0. updated_at helper (no shared one exists in this repo yet)
-- ============================================================
create or replace function public.invoicing_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================================
-- 1. Add-on flags on profiles (same shape as the AI add-on, scripts/077-078)
-- ============================================================
alter table public.profiles
  add column if not exists invoicing_addon_active boolean not null default false,
  -- Manual override, never touched by the Stripe webhook (same idea as
  -- ai_addon_override) - for the pilot business or David's own accounts.
  add column if not exists invoicing_addon_override boolean not null default false,
  -- Grace period after cancelling: keeps working until the paid period ends.
  add column if not exists invoicing_addon_access_until timestamptz null;

-- ============================================================
-- 2. Client fiscal data (clients are org-wide since scripts/053, so a
--    client's RUC/razón social is shared across sedes - intended)
-- ============================================================
alter table public.clients
  add column if not exists fiscal_name text,     -- razón social (facturas)
  add column if not exists fiscal_address text;  -- dirección fiscal (facturas)

-- 'ce' = carné de extranjería, common in Peru and a valid SUNAT document type.
alter table public.clients drop constraint if exists clients_document_type_check;
alter table public.clients
  add constraint clients_document_type_check
  check (document_type is null or document_type in ('dni', 'ruc', 'ce', 'ein', 'passport', 'other'));

-- ============================================================
-- 3. Which comprobante the client asked for (null = boleta)
-- ============================================================
alter table public.reservations
  add column if not exists invoice_type_requested text;
alter table public.reservations drop constraint if exists reservations_invoice_type_requested_check;
alter table public.reservations
  add constraint reservations_invoice_type_requested_check
  check (invoice_type_requested is null or invoice_type_requested in ('boleta', 'factura'));

-- ============================================================
-- 4. Per-sede invoicing settings
-- ============================================================
create table if not exists public.business_invoicing_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  provider text not null default 'nubefact' check (provider in ('nubefact')),
  environment text not null default 'demo' check (environment in ('demo', 'production')),
  api_url text not null,                -- Nubefact "RUTA"
  api_token_encrypted text not null,    -- Nubefact "TOKEN", AES-256-GCM (lib/crypto.ts)
  ruc text not null check (ruc ~ '^(10|15|17|20)\d{9}$'),
  razon_social text not null check (length(trim(razon_social)) > 0),
  -- Defaults end in 2 on purpose: iPlanit uses its OWN series so it never
  -- collides with numbers the business keeps issuing elsewhere (Viutify,
  -- the Nubefact panel) during the switch.
  serie_factura text not null default 'F002' check (serie_factura ~ '^F[A-Z0-9]{3}$'),
  serie_boleta text not null default 'B002' check (serie_boleta ~ '^B[A-Z0-9]{3}$'),
  -- SUNAT: a credit note for a factura uses an F series, for a boleta a B series.
  serie_nc_factura text not null default 'FC02' check (serie_nc_factura ~ '^F[A-Z0-9]{3}$'),
  serie_nc_boleta text not null default 'BC02' check (serie_nc_boleta ~ '^B[A-Z0-9]{3}$'),
  prices_include_igv boolean not null default true,
  igv_affectation text not null default 'gravado' check (igv_affectation in ('gravado', 'exonerado', 'inafecto')),
  igv_rate numeric(5,2) not null default 18 check (igv_rate >= 0 and igv_rate <= 30),
  -- Off by default: a wrong comprobante can't be edited, only voided with a
  -- credit note - so the default flow is "preview, then emit".
  auto_emit boolean not null default false,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_invoicing_settings_series_distinct check (
    serie_factura <> serie_nc_factura and serie_boleta <> serie_nc_boleta
  )
);

create index if not exists business_invoicing_settings_ruc_idx
  on public.business_invoicing_settings(ruc);

drop trigger if exists business_invoicing_settings_touch on public.business_invoicing_settings;
create trigger business_invoicing_settings_touch
  before update on public.business_invoicing_settings
  for each row execute function public.invoicing_touch_updated_at();

-- Two sedes may share one RUC, but never a series: the correlative belongs to
-- (RUC, series), so a shared series would make both sedes hand out the same
-- numbers. Checked across all four series columns of every other sede with
-- the same RUC.
create or replace function public.check_invoicing_series_unique()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.business_invoicing_settings s
    where s.ruc = new.ruc
      and s.business_id <> new.business_id
      and array[s.serie_factura, s.serie_boleta, s.serie_nc_factura, s.serie_nc_boleta]
          && array[new.serie_factura, new.serie_boleta, new.serie_nc_factura, new.serie_nc_boleta]
  ) then
    raise exception 'invoicing_series_in_use' using errcode = 'INV01';
  end if;
  return new;
end;
$$;

drop trigger if exists business_invoicing_settings_series_unique on public.business_invoicing_settings;
create trigger business_invoicing_settings_series_unique
  before insert or update on public.business_invoicing_settings
  for each row execute function public.check_invoicing_series_unique();

-- ============================================================
-- 5. Correlatives, keyed by (RUC, series) - not by sede
-- ============================================================
create table if not exists public.invoice_series_counters (
  ruc text not null,
  serie text not null,
  last_number int not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now(),
  primary key (ruc, serie)
);

-- ============================================================
-- 6. Comprobantes
-- ============================================================
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  ruc text not null,
  reservation_id uuid references public.reservations(id) on delete set null,
  doc_type text not null check (doc_type in ('01', '03', '07')), -- factura, boleta, nota de crédito
  serie text not null check (serie ~ '^[FB][A-Z0-9]{3}$'),
  numero int not null check (numero > 0),
  related_invoice_id uuid references public.invoices(id) on delete restrict,
  credit_note_reason text,  -- SUNAT catálogo 09, e.g. '01' anulación de la operación

  -- Customer snapshot (SUNAT catálogo 06: 1 DNI, 4 CE, 6 RUC, 7 pasaporte,
  -- 0 doc. no domiciliado, A cédula diplomática, '-' clientes varios)
  customer_doc_type text not null check (customer_doc_type in ('0', '1', '4', '6', '7', 'A', '-')),
  customer_doc_number text,
  customer_name text not null,
  customer_address text,
  customer_email text,

  -- Exactly what was sent, so the comprobante can be rebuilt/audited later.
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  currency text not null check (currency in ('PEN', 'USD')),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  igv numeric(12,2) not null check (igv >= 0),
  total numeric(12,2) not null check (total >= 0),

  status text not null default 'pending'
    check (status in ('pending', 'sent', 'accepted', 'rejected', 'error', 'voided')),
  attempts int not null default 0,
  last_error text,
  next_retry_at timestamptz,

  provider_response jsonb,
  pdf_url text,
  xml_url text,
  cdr_url text,
  sunat_description text,
  sunat_hash text,
  qr_string text,

  issue_date date not null,   -- calendar date in America/Lima, not UTC
  issued_at timestamptz,      -- when the provider accepted it
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint invoices_number_unique unique (ruc, serie, numero),
  constraint invoices_credit_note_fields check (
    (doc_type = '07' and related_invoice_id is not null and credit_note_reason is not null)
    or (doc_type <> '07' and related_invoice_id is null and credit_note_reason is null)
  ),
  -- A factura always goes to a RUC. (The boleta rule - document required
  -- from S/ 700 - lives in lib/invoicing/build-draft.ts, since it depends
  -- on the amount in soles.)
  constraint invoices_factura_needs_ruc check (doc_type <> '01' or customer_doc_type = '6')
);

-- One live factura/boleta per reservation (rejected/voided ones don't count,
-- so a corrected one can be issued after).
create unique index if not exists invoices_one_live_per_reservation
  on public.invoices(reservation_id)
  where reservation_id is not null
    and doc_type in ('01', '03')
    and status not in ('rejected', 'voided');

-- One live credit note per original comprobante.
create unique index if not exists invoices_one_live_credit_note
  on public.invoices(related_invoice_id)
  where doc_type = '07' and status not in ('rejected', 'voided');

create index if not exists invoices_business_created_idx
  on public.invoices(business_id, created_at desc);

create index if not exists invoices_retry_idx
  on public.invoices(next_retry_at)
  where status in ('pending', 'error');

drop trigger if exists invoices_touch on public.invoices;
create trigger invoices_touch
  before update on public.invoices
  for each row execute function public.invoicing_touch_updated_at();

-- ============================================================
-- 7. RLS
-- ============================================================
alter table public.business_invoicing_settings enable row level security;
alter table public.invoice_series_counters enable row level security;
alter table public.invoices enable row level security;

-- Settings: NO select policy for logged-in users on purpose - the row holds
-- the encrypted PSE token. The dashboard reads it through
-- get_invoicing_settings() below, which never returns the token.
drop policy if exists "Service role can manage invoicing settings" on public.business_invoicing_settings;
create policy "Service role can manage invoicing settings"
  on public.business_invoicing_settings for all
  using (auth.role() = 'service_role');

drop policy if exists "Service role can manage invoice counters" on public.invoice_series_counters;
create policy "Service role can manage invoice counters"
  on public.invoice_series_counters for all
  using (auth.role() = 'service_role');

-- Invoices: readable by whoever can already see the business's reservations
-- (owner + admin/sales members, scripts/052). Worker accounts (scripts/104)
-- have no table access at all, so they're excluded automatically.
drop policy if exists "Business members can view invoices" on public.invoices;
create policy "Business members can view invoices"
  on public.invoices for select
  using (public.is_business_accessible(business_id));

drop policy if exists "Service role can manage invoices" on public.invoices;
create policy "Service role can manage invoices"
  on public.invoices for all
  using (auth.role() = 'service_role');

-- ============================================================
-- 8. Functions
-- ============================================================

-- Does this business currently have the add-on? Server-side only (no auth
-- check - API routes call it with the service role after verifying the user
-- themselves). Peru-only, any paid plan, and active / overridden / exempt /
-- still inside the grace period.
create or replace function public.business_has_invoicing_access(p_business_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((
    select b.country = 'PE'
      and public.get_business_plan(b.id) in ('basic', 'pro', 'premium')
      and (
        p.billing_exempt
        or p.invoicing_addon_override
        or p.invoicing_addon_active
        or (p.invoicing_addon_access_until is not null and p.invoicing_addon_access_until > now())
      )
    from public.businesses b
    join public.profiles p on p.id = b.owner_id
    where b.id = p_business_id
  ), false);
$$;

-- Dashboard read of the settings - never includes the token. Owner/admin get
-- everything else; sales members only what the reservation modal needs.
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
      'environment', v_settings.environment,
      'api_url', v_settings.api_url,
      'token_configured', true,
      'ruc', v_settings.ruc,
      'razon_social', v_settings.razon_social,
      'serie_factura', v_settings.serie_factura,
      'serie_boleta', v_settings.serie_boleta,
      'serie_nc_factura', v_settings.serie_nc_factura,
      'serie_nc_boleta', v_settings.serie_nc_boleta,
      'prices_include_igv', v_settings.prices_include_igv,
      'igv_affectation', v_settings.igv_affectation,
      'igv_rate', v_settings.igv_rate,
      'updated_at', v_settings.updated_at
    ) end,
    -- Prefill for first-time setup (scripts/022).
    'business_tax_id', (select tax_id from public.businesses where id = p_business_id)
  );
end;
$$;

-- Next correlative for (RUC, series). Atomic: the row lock taken by
-- ON CONFLICT DO UPDATE serializes concurrent callers.
create or replace function public.next_invoice_number(p_ruc text, p_serie text)
returns int
language sql
security definer
set search_path = public
as $$
  insert into public.invoice_series_counters as c (ruc, serie, last_number)
  values (p_ruc, p_serie, 1)
  on conflict (ruc, serie) do update
    set last_number = c.last_number + 1,
        updated_at = now()
  returning last_number;
$$;

-- Reserve a number AND insert the 'pending' row in one transaction, so a
-- crash between the two can't burn a number, and a double click can't
-- create two comprobantes for the same reservation (returns the existing
-- live one instead). p_invoice is a jsonb shaped like an invoices row;
-- id/numero/status/attempts/timestamps are set here, not by the caller.
create or replace function public.create_pending_invoice(p_invoice jsonb)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.invoices;
  v_existing public.invoices;
begin
  v_row := jsonb_populate_record(null::public.invoices, p_invoice);

  if v_row.reservation_id is not null and v_row.doc_type in ('01', '03') then
    select * into v_existing
    from public.invoices
    where reservation_id = v_row.reservation_id
      and doc_type in ('01', '03')
      and status not in ('rejected', 'voided')
    limit 1;
    if found then
      return v_existing;
    end if;
  end if;

  v_row.id := gen_random_uuid();
  v_row.status := 'pending';
  v_row.attempts := 0;
  v_row.last_error := null;
  v_row.next_retry_at := null;
  v_row.issued_at := null;
  v_row.created_at := now();
  v_row.updated_at := now();

  begin
    -- Inside the block so a failed insert also rolls back the counter bump.
    v_row.numero := public.next_invoice_number(v_row.ruc, v_row.serie);
    insert into public.invoices select v_row.*;
  exception when unique_violation then
    -- A concurrent request for the same reservation won the race.
    if v_row.reservation_id is not null and v_row.doc_type in ('01', '03') then
      select * into v_existing
      from public.invoices
      where reservation_id = v_row.reservation_id
        and doc_type in ('01', '03')
        and status not in ('rejected', 'voided')
      limit 1;
      if found then
        return v_existing;
      end if;
    end if;
    raise;
  end;

  return v_row;
end;
$$;

-- Let a business continue an existing series (e.g. the one it used before
-- iPlanit). p_next_number = the next number to issue. Only allowed while
-- iPlanit hasn't issued anything on that (RUC, series) yet.
create or replace function public.set_invoice_series_start(p_ruc text, p_serie text, p_next_number int)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_next_number is null or p_next_number < 1 then
    return json_build_object('error', 'invalid_number');
  end if;

  if exists (select 1 from public.invoices where ruc = p_ruc and serie = p_serie) then
    return json_build_object('error', 'series_already_used');
  end if;

  insert into public.invoice_series_counters as c (ruc, serie, last_number)
  values (p_ruc, p_serie, p_next_number - 1)
  on conflict (ruc, serie) do update
    set last_number = excluded.last_number,
        updated_at = now();

  return json_build_object('success', true, 'next_number', p_next_number);
end;
$$;

-- Grants: the user-facing RPC to authenticated; everything that hands out
-- numbers or bypasses auth only to the service role.
revoke all on function public.get_invoicing_settings(uuid) from public, anon;
grant execute on function public.get_invoicing_settings(uuid) to authenticated;

revoke all on function public.business_has_invoicing_access(uuid) from public, anon, authenticated;
revoke all on function public.next_invoice_number(text, text) from public, anon, authenticated;
revoke all on function public.create_pending_invoice(jsonb) from public, anon, authenticated;
revoke all on function public.set_invoice_series_start(text, text, int) from public, anon, authenticated;
grant execute on function public.business_has_invoicing_access(uuid) to service_role;
grant execute on function public.next_invoice_number(text, text) to service_role;
grant execute on function public.create_pending_invoice(jsonb) to service_role;
grant execute on function public.set_invoice_series_start(text, text, int) to service_role;
