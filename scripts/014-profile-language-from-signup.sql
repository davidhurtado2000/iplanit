-- The register page now has an ES/EN toggle; the chosen language rides
-- along as signUp() metadata (same mechanism as business_name/business_type
-- in scripts/011 and 013) so the profile is created with the right language
-- instead of always defaulting to 'es'.

create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_business_name text;
  v_business_type text;
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
    v_timezone := coalesce(new.raw_user_meta_data->>'timezone', 'America/Lima');
    v_slug := lower(regexp_replace(v_business_name, '\s+', '-', 'g')) || '-' || substr(new.id::text, 1, 8);

    insert into public.businesses (owner_id, name, timezone, slug, type)
    values (new.id, v_business_name, v_timezone, v_slug, v_business_type);
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;
