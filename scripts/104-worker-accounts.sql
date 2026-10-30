-- Worker (barbero/staff) accounts: free on every plan, READ-ONLY, and only
-- that worker's own appointments and numbers (David's call, 2026-10-29).
--
-- Deliberately NOT a new business_members role. is_business_accessible()
-- (scripts/024/052) opens SELECT on reservations, clients, services, etc.
-- to ANY business member - adding workers there would let a barber read
-- every client and the business's revenue. Instead a worker account is a
-- plain link (workers.user_id) that grants zero table access; everything
-- the portal shows comes through the security-definer functions below,
-- each scoped to auth.uid()'s own linked worker rows.

alter table public.workers
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists invite_email text,
  add column if not exists invited_at timestamptz;

-- One account per worker row, and one worker row per account per business
-- (a barber at two sedes has two worker rows - one link each - which the
-- portal shows side by side).
create unique index if not exists workers_business_user_unique
  on public.workers (business_id, user_id)
  where user_id is not null;

create index if not exists workers_pending_invite_email_idx
  on public.workers (lower(invite_email))
  where user_id is null and invite_email is not null;

-- Owner/admin gives (or re-sends) access. Links immediately if that email
-- already has an iPlanit account; otherwise stays pending and is claimed by
-- get_my_worker_links() the first time that person signs in.
create or replace function public.invite_worker_access(p_worker_id uuid, p_email text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_email text;
  v_user_id uuid;
begin
  select business_id into v_business_id from public.workers where id = p_worker_id;
  if v_business_id is null then
    return json_build_object('error', 'worker_not_found');
  end if;

  if public.business_member_role(v_business_id) is null
     or public.business_member_role(v_business_id) not in ('owner', 'admin') then
    return json_build_object('error', 'not_allowed');
  end if;

  v_email := lower(trim(p_email));
  if v_email is null or v_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    return json_build_object('error', 'invalid_email');
  end if;

  select id into v_user_id from public.profiles where lower(email) = v_email limit 1;

  if exists (
    select 1 from public.workers w
    where w.business_id = v_business_id
      and w.id <> p_worker_id
      and (lower(w.invite_email) = v_email or (v_user_id is not null and w.user_id = v_user_id))
  ) then
    return json_build_object('error', 'email_in_use');
  end if;

  update public.workers
  set invite_email = v_email,
      invited_at = now(),
      user_id = v_user_id
  where id = p_worker_id;

  return json_build_object(
    'success', true,
    'status', case when v_user_id is null then 'invited' else 'linked' end,
    'email', v_email
  );
end;
$$;

create or replace function public.revoke_worker_access(p_worker_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
begin
  select business_id into v_business_id from public.workers where id = p_worker_id;
  if v_business_id is null then
    return json_build_object('error', 'worker_not_found');
  end if;

  if public.business_member_role(v_business_id) is null
     or public.business_member_role(v_business_id) not in ('owner', 'admin') then
    return json_build_object('error', 'not_allowed');
  end if;

  update public.workers
  set user_id = null, invite_email = null, invited_at = null
  where id = p_worker_id;

  return json_build_object('success', true);
end;
$$;

-- The calling user's worker links (active workers only - deactivating or
-- deleting a worker is how an owner cuts access off). Claims any pending
-- invite for the caller's confirmed email first, so "invite before they
-- sign up" needs no trigger on signup.
create or replace function public.get_my_worker_links()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if auth.uid() is null then
    return '[]'::json;
  end if;

  select lower(email) into v_email
  from auth.users
  where id = auth.uid() and email_confirmed_at is not null;

  if v_email is not null then
    update public.workers w
    set user_id = auth.uid()
    where w.user_id is null
      and lower(w.invite_email) = v_email
      and not exists (
        select 1 from public.workers w2
        where w2.business_id = w.business_id and w2.user_id = auth.uid()
      );
  end if;

  return coalesce((
    select json_agg(json_build_object(
      'worker_id', w.id,
      'worker_name', w.name,
      'photo_url', w.photo_url,
      'color', w.color,
      'business_id', b.id,
      'business_name', b.name,
      'business_logo_url', b.logo_url,
      'timezone', b.timezone,
      'currency', b.currency
    ) order by b.name, w.name)
    from public.workers w
    join public.businesses b on b.id = w.business_id
    where w.user_id = auth.uid() and w.is_active = true
  ), '[]'::json);
end;
$$;

-- One worker's own appointments in a window (capped at ~2 months per call).
-- Client name and notes are included - it's their client in their chair -
-- but nothing else about the client (no phone/email/history).
create or replace function public.get_my_worker_agenda(p_worker_id uuid, p_from timestamptz, p_to timestamptz)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(json_agg(json_build_object(
    'id', r.id,
    'start_time', r.start_time,
    'end_time', r.end_time,
    'status', r.status,
    'type', r.type,
    'service_name', s.name,
    'service_color', s.color,
    'client_name', c.name,
    'notes', r.notes,
    'price', r.price,
    'price_usd', r.price_usd
  ) order by r.start_time), '[]'::json)
  from public.reservations r
  join public.workers w on w.id = r.worker_id
  left join public.services s on s.id = r.service_id
  left join public.clients c on c.id = r.client_id
  where r.worker_id = p_worker_id
    and w.user_id = auth.uid()
    and w.is_active = true
    and p_to > p_from
    and p_to - p_from <= interval '62 days'
    and r.start_time < p_to
    and r.end_time > p_from;
$$;

revoke all on function public.invite_worker_access(uuid, text) from public, anon;
revoke all on function public.revoke_worker_access(uuid) from public, anon;
revoke all on function public.get_my_worker_links() from public, anon;
revoke all on function public.get_my_worker_agenda(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.invite_worker_access(uuid, text) to authenticated;
grant execute on function public.revoke_worker_access(uuid) to authenticated;
grant execute on function public.get_my_worker_links() to authenticated;
grant execute on function public.get_my_worker_agenda(uuid, timestamptz, timestamptz) to authenticated;
