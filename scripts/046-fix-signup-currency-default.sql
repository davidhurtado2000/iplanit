-- handle_new_user() (scripts 011/013/014/023) creates the business row on
-- signup with an explicit country, but never set currency - it silently
-- fell back to the businesses.currency column's own default, which
-- (script 030) is unconditionally 'PEN' regardless of country. A US
-- business registered with country='US' still got PEN. Same
-- country -> currency mapping as script 030's one-time backfill, just
-- applied going forward for every new signup instead of only historical rows.
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
begin
  v_language := coalesce(nullif(trim(new.raw_user_meta_data->>'language'), ''), 'es');

  insert into public.profiles (id, email, full_name, language)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), v_language);

  v_business_name := nullif(trim(new.raw_user_meta_data->>'business_name'), '');

  if v_business_name is not null then
    v_business_type := nullif(trim(new.raw_user_meta_data->>'business_type'), '');
    v_business_country := coalesce(nullif(trim(new.raw_user_meta_data->>'business_country'), ''), 'PE');
    v_currency := case when v_business_country = 'US' then 'USD' else 'PEN' end;
    v_timezone := coalesce(new.raw_user_meta_data->>'timezone', 'America/Lima');
    v_slug := lower(regexp_replace(v_business_name, '\s+', '-', 'g')) || '-' || substr(new.id::text, 1, 8);

    insert into public.businesses (owner_id, name, timezone, slug, type, country, currency)
    values (new.id, v_business_name, v_timezone, v_slug, v_business_type, v_business_country, v_currency);
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;
