-- Worker pay: commissions and tips (requested by Carppone, 2026-11-13).
--
-- Record-keeping only: iPlanit never moves money. It works out how much of
-- each completed appointment belongs to the worker so the owner knows what
-- to pay (Analytics -> Pagos) and the worker sees their own earnings
-- (/mi-agenda). Logic lives in lib/worker-pay.ts.
--
-- * workers.pay_type: null = not set up (earnings not calculated),
--   'commission' = commission_pct of every service, 'salary' = fixed pay
--   (0% of services; tips still count). Chair rental = commission 100%.
-- * businesses.tip_worker_pct: share of each tip that goes to the worker.
-- * businesses.pay_excludes_tax: Peru - the commission is worked out on the
--   price without IGV (18%).
-- * businesses.workers_see_sales: the worker also sees the full amount
--   charged, not only their share.
-- * reservations.tip_amount: recorded in the "¿Cómo pagó?" step.
-- * reservations.worker_pay_pct / tip_worker_pct / pay_excludes_tax: the
--   rule in force when the appointment was completed (trigger below), so
--   changing a worker's % later never rewrites past earnings. Null = no
--   snapshot (the worker wasn't set up yet): the app falls back to the
--   worker's current settings.

alter table public.workers
  add column if not exists pay_type text,
  add column if not exists commission_pct numeric(5,2);
alter table public.workers drop constraint if exists workers_pay_type_check;
alter table public.workers add constraint workers_pay_type_check
  check (pay_type is null or pay_type in ('commission', 'salary'));
alter table public.workers drop constraint if exists workers_commission_pct_check;
alter table public.workers add constraint workers_commission_pct_check
  check (commission_pct is null or (commission_pct >= 0 and commission_pct <= 100));

alter table public.businesses
  add column if not exists tip_worker_pct numeric(5,2) not null default 100,
  add column if not exists pay_excludes_tax boolean not null default false,
  add column if not exists workers_see_sales boolean not null default false;
alter table public.businesses drop constraint if exists businesses_tip_worker_pct_check;
alter table public.businesses add constraint businesses_tip_worker_pct_check
  check (tip_worker_pct >= 0 and tip_worker_pct <= 100);

alter table public.reservations
  add column if not exists tip_amount numeric(10,2),
  add column if not exists worker_pay_pct numeric(5,2),
  add column if not exists tip_worker_pct numeric(5,2),
  add column if not exists pay_excludes_tax boolean;
alter table public.reservations drop constraint if exists reservations_tip_amount_check;
alter table public.reservations add constraint reservations_tip_amount_check
  check (tip_amount is null or tip_amount >= 0);

-- Snapshot the pay rule when an appointment is completed (from anywhere:
-- the modal, the calendar, the API). Kept when it is reopened and completed
-- again for the same worker; retaken when the worker changes, or when there
-- was no snapshot yet (worker set up after the fact).
create or replace function public.snapshot_worker_pay()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  w record;
  b record;
begin
  if new.status <> 'completed' or new.worker_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.worker_id is not distinct from new.worker_id
     and new.worker_pay_pct is not null then
    return new;
  end if;

  select pay_type, commission_pct into w from public.workers where id = new.worker_id;
  select tip_worker_pct, pay_excludes_tax into b from public.businesses where id = new.business_id;

  new.worker_pay_pct := case w.pay_type
    when 'commission' then w.commission_pct
    when 'salary' then 0
    else null
  end;
  if new.worker_pay_pct is null then
    -- Not set up: leave everything empty so the current settings apply.
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
  before insert or update of status, worker_id on public.reservations
  for each row execute function public.snapshot_worker_pay();

-- Worker portal: same as scripts/104 plus the pay settings, so /mi-agenda can
-- show "Tu ganancia".
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
      'workers_see_sales', b.workers_see_sales
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
    'pay_excludes_tax', r.pay_excludes_tax
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

revoke all on function public.get_my_worker_links() from public, anon;
revoke all on function public.get_my_worker_agenda(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.snapshot_worker_pay() from public, anon, authenticated;
grant execute on function public.get_my_worker_links() to authenticated;
grant execute on function public.get_my_worker_agenda(uuid, timestamptz, timestamptz) to authenticated;
