-- Bug fix: is_business_accessible() and add_business_staff() (script 024)
-- checked businesses.plan, but Premium status has always lived on
-- profiles.plan everywhere else in the app (see premium-feature.tsx,
-- reservation-modal.tsx, dashboard, clients page) - businesses.plan is an
-- old unused column from the original scaffold that nothing ever writes to.
-- This makes both functions check the business owner's profile instead.

create or replace function public.is_business_accessible(target_business_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = target_business_id
    and (
      b.owner_id = auth.uid()
      or (
        exists (select 1 from public.profiles p where p.id = b.owner_id and p.plan = 'premium')
        and exists (
          select 1 from public.business_members bm
          where bm.business_id = b.id and bm.user_id = auth.uid()
        )
      )
    )
  );
$$;

create or replace function public.add_business_staff(p_business_id uuid, p_email text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_plan text;
  v_target_id uuid;
  v_target_name text;
begin
  select owner_id into v_owner_id
  from public.businesses where id = p_business_id;

  if v_owner_id is null then
    return json_build_object('error', 'business_not_found');
  end if;

  if v_owner_id <> auth.uid() then
    return json_build_object('error', 'not_owner');
  end if;

  select plan into v_plan from public.profiles where id = v_owner_id;

  if v_plan <> 'premium' then
    return json_build_object('error', 'not_premium');
  end if;

  select id, full_name into v_target_id, v_target_name
  from public.profiles where lower(email) = lower(trim(p_email));

  if v_target_id is null then
    return json_build_object('error', 'user_not_found');
  end if;

  if v_target_id = v_owner_id then
    return json_build_object('error', 'is_owner');
  end if;

  insert into public.business_members (business_id, user_id, email, full_name)
  values (p_business_id, v_target_id, lower(trim(p_email)), v_target_name)
  on conflict (business_id, user_id) do nothing;

  return json_build_object('success', true, 'name', v_target_name, 'email', p_email);
end;
$$;
