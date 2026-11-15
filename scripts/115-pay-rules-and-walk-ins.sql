-- Pay rules per service and for after-hours work, plus walk-in clients
-- (Carppone's training session, 2026-11-15). Builds on scripts/114.
--
-- Commission precedence (lib/worker-pay.ts mirrors this exactly):
--   1. services.worker_commission_pct - a fixed % for that service, for
--      every worker (Facial Black Mask 50%, Decoloracion 70%...). Wins even
--      when the appointment was after hours.
--   2. businesses.off_hours_commission_pct when reservations.off_hours -
--      work outside the BUSINESS's opening hours (e.g. a walk-in the barber
--      takes after closing). Null = rule not used.
--   3. the worker's own commission_pct.
--   A worker on 'salary' always gets 0% of services; a worker whose pay
--   isn't set up gets nothing calculated (null), as in scripts/114.
--
-- clients.is_walk_in: one shared "Cliente de paso" per organization, for
-- walk-ins and tourists who won't give their details - so they don't fill
-- the client list with one-off "Cliente" rows or skew client reports.

alter table public.services
  add column if not exists worker_commission_pct numeric(5,2);
alter table public.services drop constraint if exists services_worker_commission_pct_check;
alter table public.services add constraint services_worker_commission_pct_check
  check (worker_commission_pct is null or (worker_commission_pct >= 0 and worker_commission_pct <= 100));

alter table public.businesses
  add column if not exists off_hours_commission_pct numeric(5,2);
alter table public.businesses drop constraint if exists businesses_off_hours_commission_pct_check;
alter table public.businesses add constraint businesses_off_hours_commission_pct_check
  check (off_hours_commission_pct is null or (off_hours_commission_pct >= 0 and off_hours_commission_pct <= 100));

alter table public.reservations
  add column if not exists off_hours boolean not null default false;

alter table public.clients
  add column if not exists is_walk_in boolean not null default false;
create unique index if not exists clients_one_walk_in_per_org
  on public.clients (organization_id) where is_walk_in;

-- Same snapshot as scripts/114, with the new precedence, and retaken when
-- the service or the after-hours mark changes on a completed appointment.
create or replace function public.snapshot_worker_pay()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  w record;
  b record;
  v_service_pct numeric(5,2);
begin
  if new.status <> 'completed' or new.worker_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.worker_id is not distinct from new.worker_id
     and old.service_id is not distinct from new.service_id
     and old.off_hours is not distinct from new.off_hours
     and new.worker_pay_pct is not null then
    return new;
  end if;

  select pay_type, commission_pct into w from public.workers where id = new.worker_id;
  select tip_worker_pct, pay_excludes_tax, off_hours_commission_pct into b
    from public.businesses where id = new.business_id;
  select worker_commission_pct into v_service_pct from public.services where id = new.service_id;

  new.worker_pay_pct := case
    when w.pay_type = 'salary' then 0
    when w.pay_type = 'commission' then coalesce(
      v_service_pct,
      case when new.off_hours then b.off_hours_commission_pct end,
      w.commission_pct
    )
    else null
  end;
  if new.worker_pay_pct is null then
    new.tip_worker_pct := null;
    new.pay_excludes_tax := null;
  else
    new.tip_worker_pct := b.tip_worker_pct;
    new.pay_excludes_tax := b.pay_excludes_tax;
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_snapshot_worker_pay on public.reservations;
create trigger reservations_snapshot_worker_pay
  before insert or update of status, worker_id, service_id, off_hours on public.reservations
  for each row execute function public.snapshot_worker_pay();

-- The shared walk-in client for a business's organization, created on first
-- use. Any member of the business may call it (same people who can create
-- clients); returns the client id.
create or replace function public.get_walk_in_client(p_business_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_id uuid;
begin
  if not public.is_business_accessible(p_business_id) then
    raise exception 'not allowed';
  end if;
  select organization_id into v_org from public.businesses where id = p_business_id;

  select id into v_id from public.clients where organization_id = v_org and is_walk_in;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.clients (business_id, organization_id, name, notes, is_active, is_walk_in)
  values (p_business_id, v_org, 'Cliente de paso',
          'Para atenciones sin cita de clientes que no dejan sus datos.', true, true)
  on conflict (organization_id) where is_walk_in do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.clients where organization_id = v_org and is_walk_in;
  end if;
  return v_id;
end;
$$;

-- Worker portal: scripts/114 plus the inputs the fallback calculation needs
-- for appointments without a snapshot (service %, after-hours mark/rule).
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
      'currency', b.currency,
      'pay_type', w.pay_type,
      'commission_pct', w.commission_pct,
      'tip_worker_pct', b.tip_worker_pct,
      'pay_excludes_tax', b.pay_excludes_tax,
      'workers_see_sales', b.workers_see_sales,
      'off_hours_commission_pct', b.off_hours_commission_pct
    ) order by b.name, w.name)
    from public.workers w
    join public.businesses b on b.id = w.business_id
    where w.user_id = auth.uid() and w.is_active = true
  ), '[]'::json);
end;
$$;

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
    'price_usd', r.price_usd,
    'tip_amount', r.tip_amount,
    'worker_pay_pct', r.worker_pay_pct,
    'tip_worker_pct', r.tip_worker_pct,
    'pay_excludes_tax', r.pay_excludes_tax,
    'off_hours', r.off_hours,
    'service_commission_pct', s.worker_commission_pct
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

revoke all on function public.get_walk_in_client(uuid) from public, anon;
revoke all on function public.get_my_worker_links() from public, anon;
revoke all on function public.get_my_worker_agenda(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.snapshot_worker_pay() from public, anon, authenticated;
grant execute on function public.get_walk_in_client(uuid) to authenticated;
grant execute on function public.get_my_worker_links() to authenticated;
grant execute on function public.get_my_worker_agenda(uuid, timestamptz, timestamptz) to authenticated;
