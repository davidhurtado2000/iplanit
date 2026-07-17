-- The business itself also needs its own tax ID (RUC in Peru, EIN in the
-- US) for its profile, separate from the client-level dni/ruc added in
-- script 009. Generic name since which label it represents depends on
-- businesses.country (see script 021).

alter table public.businesses
  add column if not exists tax_id text;
