-- Registration now asks for the business's country up front (see the new
-- selector on the register page) instead of leaving it to default silently
-- to 'PE' and only discoverable later in Settings. Teaches handle_new_user()
-- to read business_country from signUp() metadata, same as business_type.

create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_business_name text;
  v_business_type text;
  v_business_country text;
  v_timezone text;
  v_slug text;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));

  v_business_name := nullif(trim(new.raw_user_meta_data->>'business_name'), '');

  if v_business_name is not null then
    v_business_type := nullif(trim(new.raw_user_meta_data->>'business_type'), '');
    v_business_country := coalesce(nullif(trim(new.raw_user_meta_data->>'business_country'), ''), 'PE');
    v_timezone := coalesce(new.raw_user_meta_data->>'timezone', 'America/Lima');
    v_slug := lower(regexp_replace(v_business_name, '\s+', '-', 'g')) || '-' || substr(new.id::text, 1, 8);

    insert into public.businesses (owner_id, name, timezone, slug, type, country)
    values (new.id, v_business_name, v_timezone, v_slug, v_business_type, v_business_country);
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;
