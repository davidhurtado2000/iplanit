-- Discounts that don't have to cost the barber (Carppone idea, 2026-11-18).
--
-- A 60 soles service sold at 51: the client PAYS 51 (reservations.price, so
-- reports and the boleta stay correct) and the 9 soles discount is recorded
-- apart in discount_amount. By default the BUSINESS absorbs it: the barber's
-- commission is still worked out on 60 (price + discount). With
-- discount_shared = true the barber shares the discount: commission on 51,
-- exactly as before this script existed.
--
-- A free service is the same thing: price 0, discount_amount = the normal
-- price, absorbed by the business -> the barber is still paid.
--
-- Safe: two columns (defaults keep every existing row unchanged) and two
-- function replaces. Run outside the shop's hours, then close Supabase.

-- =============================== PART 1: columns ==============================
alter table public.reservations
  add column if not exists discount_amount numeric(10,2) not null default 0
    check (discount_amount >= 0),
  add column if not exists discount_shared boolean not null default false;

comment on column public.reservations.discount_amount is
  'Discount already taken off: price is what the client paid, price + discount_amount is the normal price. Same currency as price/price_usd.';
comment on column public.reservations.discount_shared is
  'false (default): the business absorbs the discount, the barber''s commission is on price + discount_amount. true: the barber shares it (commission on price).';

-- ============== PART 2: commission snapshot counts the discount ===============
-- scripts/119's snapshot. The only change: the amount the commission is
-- worked out on (v_sale) is the price PLUS the discount when the business
-- absorbs it, and it re-runs when the discount changes.
create or replace function public.snapshot_worker_pay()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  w record;
  b record;
  v_service_pct numeric;
  v_primary_pct numeric;
  v_sale numeric;
  v_extras_total numeric := 0;
  v_extras_weighted numeric := 0;
begin
  if new.status <> 'completed' or new.worker_id is null then
    return new;
  end if;
  new.worker_auto_assigned := false;
  new.no_preference_pool := false;
  if tg_op = 'UPDATE'
     and old.worker_id is not distinct from new.worker_id
     and old.service_id is not distinct from new.service_id
     and old.off_hours is not distinct from new.off_hours
     and old.price is not distinct from new.price
     and old.price_usd is not distinct from new.price_usd
     and old.discount_amount is not distinct from new.discount_amount
     and old.discount_shared is not distinct from new.discount_shared
     and new.worker_pay_pct is not null then
    return new;
  end if;

  select pay_type, commission_pct into w from public.workers where id = new.worker_id;
  select tip_worker_pct, pay_excludes_tax, off_hours_commission_pct into b
    from public.businesses where id = new.business_id;
  select worker_commission_pct into v_service_pct from public.services where id = new.service_id;

  v_primary_pct := coalesce(v_service_pct, case when new.off_hours then b.off_hours_commission_pct end, w.commission_pct);
  -- What the client paid, plus the discount when the business absorbs it.
  v_sale := coalesce(nullif(new.price, 0), new.price_usd, 0)
            + case when new.discount_shared then 0 else coalesce(new.discount_amount, 0) end;

  select coalesce(sum(coalesce(nullif(e.price, 0), e.price_usd, 0)), 0),
         coalesce(sum(
           coalesce(nullif(e.price, 0), e.price_usd, 0)
           * coalesce(s.worker_commission_pct, case when new.off_hours then b.off_hours_commission_pct end, w.commission_pct)
         ), 0)
    into v_extras_total, v_extras_weighted
  from public.reservation_services e
  join public.services s on s.id = e.service_id
  where e.reservation_id = new.id;

  new.worker_pay_pct := case
    when w.pay_type = 'salary' then 0
    when w.pay_type = 'commission' then
      case
        when v_extras_total > 0 and v_sale > 0 and v_primary_pct is not null
          then (greatest(v_sale - v_extras_total, 0) * v_primary_pct + v_extras_weighted) / v_sale
        else v_primary_pct
      end
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
  before insert or update of status, worker_id, service_id, off_hours, start_time, price, price_usd, discount_amount, discount_shared on public.reservations
  for each row execute function public.snapshot_worker_pay();

revoke all on function public.snapshot_worker_pay() from public, anon, authenticated;

-- ============ PART 3: the barber's own agenda carries the discount ============
-- scripts/119's function plus discount_amount / discount_shared, so the
-- barber's "Tu ganancia" matches the owner's report.
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
    'discount_amount', r.discount_amount,
    'discount_shared', r.discount_shared,
    'tip_amount', r.tip_amount,
    'worker_pay_pct', r.worker_pay_pct,
    'tip_worker_pct', r.tip_worker_pct,
    'pay_excludes_tax', r.pay_excludes_tax,
    'off_hours', r.off_hours,
    'service_commission_pct', s.worker_commission_pct,
    'extras', coalesce((
      select json_agg(json_build_object(
        'name', es.name,
        'price', e.price,
        'price_usd', e.price_usd,
        'commission_pct', es.worker_commission_pct
      ) order by e.position)
      from public.reservation_services e
      join public.services es on es.id = e.service_id
      where e.reservation_id = r.id
    ), '[]'::json)
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

revoke all on function public.get_my_worker_agenda(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_my_worker_agenda(uuid, timestamptz, timestamptz) to authenticated;
