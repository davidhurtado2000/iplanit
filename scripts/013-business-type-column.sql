-- The registration form has always collected a "business type" (clinic,
-- coworking, etc.) but never persisted it anywhere - the businesses table
-- had no column for it. This adds one and teaches handle_new_user() (see
-- scripts/011) to read it from signUp() metadata, same as business_name.

alter table public.businesses
  add column if not exists type text;

create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_business_name text;
  v_business_type text;
  v_timezone text;
  v_slug text;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));

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
