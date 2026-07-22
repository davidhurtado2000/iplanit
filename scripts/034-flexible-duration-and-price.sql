-- Two related changes:
--
-- 1. Flexible-duration services: some services (cabins, sports courts)
--    don't have one fixed duration - the same service can be rented for
--    different lengths of time, each at its own price. Opt-in per service
--    (has_flexible_duration) so existing services keep working exactly as
--    before (single duration_minutes/price/price_usd) unless the owner
--    turns it on and adds options.
--
-- 2. Price snapshot on reservations: revenue in Reportes used to be
--    recalculated live from services.price every time, which meant editing
--    a service's price silently rewrote historical revenue. Reservations
--    now store the price actually used at booking time, pre-filled from
--    the service/duration option but editable by staff for one-off quotes
--    ("cotizaciones") - this is also what makes flexible-duration pricing
--    possible at all, since two reservations of the same service can now
--    have used different prices.

alter table public.services
  add column if not exists has_flexible_duration boolean not null default false;

create table if not exists public.service_duration_options (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  duration_minutes integer not null check (duration_minutes > 0),
  price numeric,
  price_usd numeric,
  created_at timestamptz not null default now()
);

alter table public.service_duration_options enable row level security;

create index if not exists service_duration_options_service_id_idx on public.service_duration_options(service_id);

-- Same access shape as service_resources (scripts 025/032): any business
-- member can read (needed to pick a duration when booking), only owner/
-- admin can write - sales never manages the service catalog.
drop policy if exists "Business members can view service_duration_options" on public.service_duration_options;
create policy "Business members can view service_duration_options"
  on public.service_duration_options for select
  using (public.is_business_accessible(business_id));

drop policy if exists "Owner/admin can insert service_duration_options" on public.service_duration_options;
create policy "Owner/admin can insert service_duration_options"
  on public.service_duration_options for insert
  with check (public.business_member_role(business_id) in ('owner', 'admin'));

drop policy if exists "Owner/admin can update service_duration_options" on public.service_duration_options;
create policy "Owner/admin can update service_duration_options"
  on public.service_duration_options for update
  using (public.business_member_role(business_id) in ('owner', 'admin'));

drop policy if exists "Owner/admin can delete service_duration_options" on public.service_duration_options;
create policy "Owner/admin can delete service_duration_options"
  on public.service_duration_options for delete
  using (public.business_member_role(business_id) in ('owner', 'admin'));

-- Price snapshot columns on reservations.
alter table public.reservations
  add column if not exists price numeric;

alter table public.reservations
  add column if not exists price_usd numeric;

-- Best-effort backfill for existing reservations: the historical price
-- actually charged isn't recoverable, so this approximates it with the
-- service's CURRENT price. Imperfect for services whose price changed
-- since, but strictly better than showing zero revenue for all past data.
update public.reservations r
set price = s.price, price_usd = s.price_usd
from public.services s
where r.service_id = s.id
  and r.price is null
  and r.price_usd is null
  and r.type = 'booking';

-- get_public_services (script 028) now also returns each service's
-- duration options, so the public booking page can offer a duration picker
-- for flexible services instead of always using the single duration_minutes.
create or replace function public.get_public_services(p_business_id uuid)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(json_agg(
    json_build_object(
      'id', s.id,
      'name', s.name,
      'description', s.description,
      'duration_minutes', s.duration_minutes,
      'price', s.price,
      'price_usd', s.price_usd,
      'color', s.color,
      'has_flexible_duration', s.has_flexible_duration,
      'duration_options', (
        select coalesce(json_agg(
          json_build_object(
            'id', o.id,
            'duration_minutes', o.duration_minutes,
            'price', o.price,
            'price_usd', o.price_usd
          )
          order by o.duration_minutes
        ), '[]'::json)
        from public.service_duration_options o
        where o.service_id = s.id
      ),
      'resources', (
        select coalesce(json_agg(json_build_object('id', r.id, 'name', r.name, 'color', r.color)), '[]'::json)
        from public.service_resources sr
        join public.resources r on r.id = sr.resource_id and r.is_active
        where sr.service_id = s.id
      )
    )
    order by s.name
  ), '[]'::json)
  from public.services s
  where s.business_id = p_business_id and s.is_active = true;
$$;

-- create_public_reservation (script 028/031) now accepts an optional
-- duration option id - when given, its duration/price win over the
-- service's own single values, and that price gets snapshotted onto the
-- reservation. The old 8-arg signature is dropped explicitly (see the same
-- note in script 032 re: CREATE OR REPLACE not touching a changed param list).
drop function if exists public.create_public_reservation(text, uuid, uuid, timestamptz, text, text, text, text);

create or replace function public.create_public_reservation(
  p_slug text,
  p_service_id uuid,
  p_resource_id uuid,
  p_start_time timestamptz,
  p_client_name text,
  p_client_email text,
  p_client_phone text,
  p_notes text,
  p_duration_option_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_duration int;
  v_price numeric;
  v_price_usd numeric;
  v_end_time timestamptz;
  v_client_id uuid;
  v_reservation_id uuid;
begin
  if p_start_time < now() then
    return json_build_object('error', 'time_in_past');
  end if;

  select id into v_business_id from public.businesses where slug = p_slug;
  if v_business_id is null then
    return json_build_object('error', 'business_not_found');
  end if;

  if p_duration_option_id is not null then
    select duration_minutes, price, price_usd into v_duration, v_price, v_price_usd
    from public.service_duration_options
    where id = p_duration_option_id and service_id = p_service_id and business_id = v_business_id;

    if v_duration is null then
      return json_build_object('error', 'duration_option_not_found');
    end if;
  else
    select duration_minutes, price, price_usd into v_duration, v_price, v_price_usd
    from public.services
    where id = p_service_id and business_id = v_business_id and is_active = true;

    if v_duration is null then
      return json_build_object('error', 'service_not_found');
    end if;
  end if;

  if p_resource_id is not null and not exists (
    select 1 from public.resources
    where id = p_resource_id and business_id = v_business_id and is_active = true
  ) then
    return json_build_object('error', 'resource_not_found');
  end if;

  if p_client_name is null or trim(p_client_name) = '' then
    return json_build_object('error', 'name_required');
  end if;

  if (p_client_email is null or trim(p_client_email) = '')
     and (p_client_phone is null or trim(p_client_phone) = '') then
    return json_build_object('error', 'contact_required');
  end if;

  v_end_time := p_start_time + (v_duration || ' minutes')::interval;

  if p_client_email is not null and trim(p_client_email) <> '' then
    select id into v_client_id from public.clients
    where business_id = v_business_id and lower(email) = lower(trim(p_client_email))
    limit 1;
  end if;

  if v_client_id is null and p_client_phone is not null and trim(p_client_phone) <> '' then
    select id into v_client_id from public.clients
    where business_id = v_business_id and phone = trim(p_client_phone)
    limit 1;
  end if;

  if v_client_id is null then
    insert into public.clients (business_id, name, email, phone)
    values (v_business_id, trim(p_client_name), nullif(trim(p_client_email), ''), nullif(trim(p_client_phone), ''))
    returning id into v_client_id;
  end if;

  begin
    insert into public.reservations
      (business_id, client_id, service_id, resource_id, start_time, end_time, status, notes, price, price_usd)
    values
      (v_business_id, v_client_id, p_service_id, p_resource_id, p_start_time, v_end_time, 'pending', nullif(trim(p_notes), ''), v_price, v_price_usd)
    returning id into v_reservation_id;
  exception
    when exclusion_violation then
      return json_build_object('error', 'time_conflict');
  end;

  return json_build_object('success', true, 'reservation_id', v_reservation_id);
end;
$$;

revoke all on function public.create_public_reservation(text, uuid, uuid, timestamptz, text, text, text, text, uuid) from public;
grant execute on function public.create_public_reservation(text, uuid, uuid, timestamptz, text, text, text, text, uuid) to anon, authenticated;
