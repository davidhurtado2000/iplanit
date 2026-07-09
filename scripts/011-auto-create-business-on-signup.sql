-- Fix: business creation used to happen from the client via a service-role
-- API route that trusted a client-supplied owner_id (IDOR). It also raced
-- the profile trigger with an arbitrary setTimeout.
--
-- New approach: business_name/timezone travel as auth signUp() metadata
-- (raw_user_meta_data) and get consumed here, in the same trigger/transaction
-- that already creates the profile row. No client-callable endpoint needed,
-- and it works whether or not email confirmation is enabled, since
-- auth.users rows (and this trigger) fire immediately on signUp().

create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_business_name text;
  v_timezone text;
  v_slug text;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));

  v_business_name := nullif(trim(new.raw_user_meta_data->>'business_name'), '');

  if v_business_name is not null then
    v_timezone := coalesce(new.raw_user_meta_data->>'timezone', 'America/Lima');
    -- Append part of the user id so two businesses with the same name
    -- never collide on the unique slug constraint.
    v_slug := lower(regexp_replace(v_business_name, '\s+', '-', 'g')) || '-' || substr(new.id::text, 1, 8);

    insert into public.businesses (owner_id, name, timezone, slug)
    values (new.id, v_business_name, v_timezone, v_slug);
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Trigger already exists (created in 001-create-profiles.sql) and points at
-- this function by name, so replacing the function body is enough.
