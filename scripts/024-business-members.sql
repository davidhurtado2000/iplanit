-- Team members (Premium): a business can add staff who operate day-to-day
-- (reservations, clients, services, resources) without being able to touch
-- business Configuracion (business info, hours) - that stays owner-only.
--
-- v1 scope deliberately kept small: the invited person must already have an
-- iPlanit account (added by email, not an invite-token/signup-branching
-- flow) - far less surface area to get wrong on a security-sensitive
-- feature. Staff access is re-checked live against businesses.plan on every
-- request (not a stored flag), so losing/regaining Premium automatically
-- revokes/restores staff access with nothing to manually fix.

create table if not exists public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'staff' check (role in ('staff')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(business_id, user_id)
);

alter table public.business_members enable row level security;

-- Deliberately no general INSERT policy: rows are only ever created through
-- add_business_staff() below, which does its own owner/premium checks
-- server-side. A client can't self-grant staff access by inserting directly.
drop policy if exists "View own membership or business roster as owner" on public.business_members;
create policy "View own membership or business roster as owner"
  on public.business_members for select
  using (
    user_id = auth.uid()
    or business_id in (select id from public.businesses where owner_id = auth.uid())
  );

drop policy if exists "Owner can remove members" on public.business_members;
create policy "Owner can remove members"
  on public.business_members for delete
  using (business_id in (select id from public.businesses where owner_id = auth.uid()));

drop policy if exists "Service role can manage members" on public.business_members;
create policy "Service role can manage members"
  on public.business_members for all
  using (auth.role() = 'service_role');

create index if not exists business_members_business_id_idx on public.business_members(business_id);
create index if not exists business_members_user_id_idx on public.business_members(user_id);

-- Central access check reused by every table's RLS policies below: true if
-- the caller owns the business, or is an active staff member of a business
-- that is CURRENTLY on Premium (re-evaluated on every call, not cached) -
-- security definer so it can read business_members/businesses without
-- recursing back through their own RLS policies.
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
        b.plan = 'premium'
        and exists (
          select 1 from public.business_members bm
          where bm.business_id = b.id and bm.user_id = auth.uid()
        )
      )
    )
  );
$$;

-- Adds an existing iPlanit user as staff on a business. All authorization
-- happens here, server-side, so it can't be bypassed by calling this RPC
-- with a different business_id than the caller owns. Never exposes more
-- than name/email of the target profile back to the caller.
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

  insert into public.business_members (business_id, user_id, email, full_name)
  values (p_business_id, v_target_id, lower(trim(p_email)), v_target_name)
  on conflict (business_id, user_id) do nothing;

  return json_build_object('success', true, 'name', v_target_name, 'email', p_email);
end;
$$;

revoke all on function public.add_business_staff(uuid, text) from public;
grant execute on function public.add_business_staff(uuid, text) to authenticated;
