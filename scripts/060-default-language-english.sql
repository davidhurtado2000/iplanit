-- English, not Spanish, is meant to be the true fallback language across
-- the whole app (see the frontend fix removing the business-country ->
-- language auto-inference in app/(auth)/register/page.tsx) - but two
-- DATABASE-level defaults still silently fell back to Spanish underneath
-- that, so a signup that somehow reaches handle_new_user() without a
-- 'language' key in raw_user_meta_data (should be rare now that the
-- frontend always sends one, but was the actual root cause when the old
-- country-inference logic sent 'es' for every non-US country) still got a
-- Spanish profile:
--   1. scripts/001-create-profiles.sql's `language text default 'es'` column
--      default - the safety net when a row is inserted without an explicit
--      language at all.
--   2. scripts/053-organizations-and-sedes.sql's handle_new_user(), whose
--      own coalesce(...) fallback was 'es' when raw_user_meta_data->>'language'
--      is null/empty.
-- Both flip to 'en' here. Existing profiles are untouched - this only
-- changes what NEW profiles get when no language is specified, not
-- anyone's current setting.

alter table public.profiles
  alter column language set default 'en';

create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_business_name text;
  v_business_type text;
  v_business_country text;
  v_currency text;
  v_timezone text;
  v_slug text;
  v_language text;
  v_organization_id uuid;
begin
  v_language := coalesce(nullif(trim(new.raw_user_meta_data->>'language'), ''), 'en');
  insert into public.profiles (id, email, full_name, language)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), v_language);

  v_business_name := nullif(trim(new.raw_user_meta_data->>'business_name'), '');
  if v_business_name is not null then
    v_business_type := nullif(trim(new.raw_user_meta_data->>'business_type'), '');
    v_business_country := coalesce(nullif(trim(new.raw_user_meta_data->>'business_country'), ''), 'PE');
    v_currency := case when v_business_country = 'US' then 'USD' else 'PEN' end;
    v_timezone := coalesce(new.raw_user_meta_data->>'timezone', 'America/Lima');
    v_slug := lower(regexp_replace(v_business_name, '\s+', '-', 'g')) || '-' || substr(new.id::text, 1, 8);

    insert into public.organizations (owner_id, name)
    values (new.id, v_business_name)
    returning id into v_organization_id;

    insert into public.businesses (owner_id, organization_id, name, timezone, slug, type, country, currency)
    values (new.id, v_organization_id, v_business_name, v_timezone, v_slug, v_business_type, v_business_country, v_currency);
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;
