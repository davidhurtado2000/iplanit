-- Splits the single "staff" role into two: 'admin' (everything the owner
-- can do operationally, minus Configuracion and team management - this is
-- exactly what 'staff' already was) and 'sales' (reservations + clients
-- only, no Servicios/Recursos management, no Reportes). Existing 'staff'
-- rows become 'admin' since that's a behavior-preserving migration - nobody
-- loses access they already had.

-- Order matters here: drop the old constraint first (so the UPDATE below
-- isn't rejected by the check that only ever allowed 'staff'), fix the
-- data, and only THEN add the new constraint - adding it any earlier would
-- fail instead, since ADD CONSTRAINT validates every existing row
-- immediately and any row still sitting at 'staff' would violate it.
alter table public.business_members
  drop constraint if exists business_members_role_check;

update public.business_members set role = 'admin' where role = 'staff';

alter table public.business_members
  add constraint business_members_role_check check (role in ('admin', 'sales'));

alter table public.business_members
  alter column role set default 'admin';

-- Owner could previously only remove a member, not change their role -
-- needed now that role is meaningful (admin vs sales), not just a fixed tag.
drop policy if exists "Owner can update member roles" on public.business_members;
create policy "Owner can update member roles"
  on public.business_members for update
  using (business_id in (select id from public.businesses where owner_id = auth.uid()))
  with check (business_id in (select id from public.businesses where owner_id = auth.uid()));

-- Returns 'owner' | 'admin' | 'sales' | null for the calling user on a given
-- business - null if they have no access at all (not owner, not an active
-- Premium staff member). is_business_accessible() (script 024) stays as
-- the broad "can see this business" gate used by SELECT policies across the
-- app - both admin and sales need to read services/resources/business
-- hours to actually do a reservation. This function is only for the few
-- write actions that must stay owner/admin-only (Servicios, Recursos).
create or replace function public.business_member_role(target_business_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.businesses where id = target_business_id and owner_id = auth.uid()
    ) then 'owner'
    else (
      select bm.role
      from public.business_members bm
      join public.businesses b on b.id = bm.business_id
      where bm.business_id = target_business_id
        and bm.user_id = auth.uid()
        and b.plan = 'premium'
      limit 1
    )
  end;
$$;

-- add_business_staff (script 024) now takes the role to assign - defaults
-- to 'admin' so existing callers (before the frontend picker ships) keep
-- today's behavior. Re-inviting an already-added member updates their role
-- instead of no-op, so it doubles as the "change this person's role" path.
-- The old 2-arg signature is dropped explicitly - CREATE OR REPLACE doesn't
-- touch it since the parameter list changed, and leaving both around would
-- make calls from old clients silently resolve to the wrong overload.
drop function if exists public.add_business_staff(uuid, text);

create or replace function public.add_business_staff(p_business_id uuid, p_email text, p_role text default 'admin')
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
  if p_role not in ('admin', 'sales') then
    return json_build_object('error', 'invalid_role');
  end if;

  select owner_id, plan into v_owner_id, v_plan
  from public.businesses where id = p_business_id;

  if v_owner_id is null then
    return json_build_object('error', 'business_not_found');
  end if;

  if v_owner_id <> auth.uid() then
    return json_build_object('error', 'not_owner');
  end if;

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

  insert into public.business_members (business_id, user_id, email, full_name, role)
  values (p_business_id, v_target_id, lower(trim(p_email)), v_target_name, p_role)
  on conflict (business_id, user_id) do update set role = excluded.role, full_name = excluded.full_name;

  return json_build_object('success', true, 'name', v_target_name, 'email', p_email, 'role', p_role);
end;
$$;

-- Servicios/Recursos: sales keeps read access (needed to pick a service and
-- resource when creating a reservation - unchanged SELECT policy from
-- script 025) but only owner/admin can create, edit or delete them.

drop policy if exists "Users can insert services to their business" on public.services;
create policy "Users can insert services to their business"
  on public.services for insert
  with check (public.business_member_role(business_id) in ('owner', 'admin'));

drop policy if exists "Users can update services of their business" on public.services;
create policy "Users can update services of their business"
  on public.services for update
  using (public.business_member_role(business_id) in ('owner', 'admin'));

drop policy if exists "Users can delete services of their business" on public.services;
create policy "Users can delete services of their business"
  on public.services for delete
  using (public.business_member_role(business_id) in ('owner', 'admin'));

drop policy if exists "Users can insert resources to their business" on public.resources;
create policy "Users can insert resources to their business"
  on public.resources for insert
  with check (public.business_member_role(business_id) in ('owner', 'admin'));

drop policy if exists "Users can update resources of their business" on public.resources;
create policy "Users can update resources of their business"
  on public.resources for update
  using (public.business_member_role(business_id) in ('owner', 'admin'));

drop policy if exists "Users can delete resources of their business" on public.resources;
create policy "Users can delete resources of their business"
  on public.resources for delete
  using (public.business_member_role(business_id) in ('owner', 'admin'));

-- service_resources (script 025) had one FOR ALL policy - split so sales
-- keeps the SELECT it needs for the reservation flow but loses write.
drop policy if exists "Business members can manage service_resources" on public.service_resources;

create policy "Business members can view service_resources"
  on public.service_resources for select
  using (public.is_business_accessible(business_id));

create policy "Owner/admin can write service_resources"
  on public.service_resources for insert
  with check (public.business_member_role(business_id) in ('owner', 'admin'));

create policy "Owner/admin can update service_resources"
  on public.service_resources for update
  using (public.business_member_role(business_id) in ('owner', 'admin'));

create policy "Owner/admin can delete service_resources"
  on public.service_resources for delete
  using (public.business_member_role(business_id) in ('owner', 'admin'));

-- No changes to reservations/clients/reservation_series/business_hours -
-- reservations+clients stay full CRUD for both admin and sales (that's the
-- whole point of the sales role), business_hours/businesses stay owner-only
-- for writes, exactly as scripts 025/026 already set up.

revoke all on function public.business_member_role(uuid) from public;
grant execute on function public.business_member_role(uuid) to authenticated;

revoke all on function public.add_business_staff(uuid, text, text) from public;
grant execute on function public.add_business_staff(uuid, text, text) to authenticated;
