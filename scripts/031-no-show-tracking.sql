-- Fase A de manejo de no-shows/cancelaciones tardias: solo registra datos y
-- comunica una politica, no procesa ningun pago (las comisiones de Stripe no
-- valen la pena para penalidades chicas - el cobro real, si el negocio
-- decide aplicarlo, lo hace por fuera del sistema, igual que ya cobra el
-- servicio en si).

alter table public.reservations
  drop constraint if exists reservations_status_check;

alter table public.reservations
  add constraint reservations_status_check
  check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show'));

-- Quien cancelo y cuando - necesario para no culpar al cliente de una
-- cancelacion tardia que en realidad hizo el negocio (ej: una emergencia),
-- y para calcular si una cancelacion de cliente cayo dentro de la ventana
-- de politica.
alter table public.reservations
  add column if not exists cancelled_by text check (cancelled_by in ('client', 'business'));

alter table public.reservations
  add column if not exists cancelled_at timestamptz;

-- No se toca reservations_no_overlap (script 012) ni get_public_busy_times
-- (script 028) - ambos solo liberan el horario cuando status = 'cancelled',
-- asi que 'no_show' se comporta igual que 'completed' automaticamente: el
-- horario queda ocupado. Es correcto porque un no-show solo se puede marcar
-- despues de que ya paso la hora de la cita.

alter table public.businesses
  add column if not exists cancellation_policy_hours integer not null default 24;

-- no_show_count y late_cancellation_count se suman al conteo existente para
-- dar una senal rapida de confiabilidad del cliente en la pagina de
-- Clientes. "Tardia" se calcula contra la politica del propio negocio, no
-- un numero fijo.
--
-- Las columnas nuevas van al final del SELECT a proposito: CREATE OR REPLACE
-- VIEW solo permite agregar columnas al final, no reordenarlas - insertarlas
-- en medio (antes de last_reservation_at) falla con "cannot change name of
-- view column" porque Postgres empareja columnas existentes por posicion.
create or replace view public.client_reservation_counts
with (security_invoker = true) as
select
  r.client_id,
  r.business_id,
  count(*) filter (where r.status <> 'cancelled') as reservation_count,
  count(*) filter (where r.status = 'confirmed') as confirmed_count,
  max(r.start_time) filter (where r.status <> 'cancelled') as last_reservation_at,
  count(*) filter (where r.status = 'no_show') as no_show_count,
  count(*) filter (
    where r.status = 'cancelled'
      and r.cancelled_by = 'client'
      and r.cancelled_at is not null
      and r.cancelled_at > r.start_time - (b.cancellation_policy_hours || ' hours')::interval
  ) as late_cancellation_count
from public.reservations r
join public.businesses b on b.id = r.business_id
group by r.client_id, r.business_id;

-- create_public_reservation (script 028) now also returns the new
-- reservation's id, so the public booking page can build a "manage/cancel
-- your reservation" link on the success screen - there's no email sending
-- yet, so this link is the only way the client gets it, shown once.
create or replace function public.create_public_reservation(
  p_slug text,
  p_service_id uuid,
  p_resource_id uuid,
  p_start_time timestamptz,
  p_client_name text,
  p_client_email text,
  p_client_phone text,
  p_notes text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_duration int;
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

  select duration_minutes into v_duration
  from public.services
  where id = p_service_id and business_id = v_business_id and is_active = true;

  if v_duration is null then
    return json_build_object('error', 'service_not_found');
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
      (business_id, client_id, service_id, resource_id, start_time, end_time, status, notes)
    values
      (v_business_id, v_client_id, p_service_id, p_resource_id, p_start_time, v_end_time, 'pending', nullif(trim(p_notes), ''))
    returning id into v_reservation_id;
  exception
    when exclusion_violation then
      return json_build_object('error', 'time_conflict');
  end;

  return json_build_object('success', true, 'reservation_id', v_reservation_id);
end;
$$;

-- Client self-service: check status and cancel their own reservation via
-- the link shown once on the booking success screen. Deliberately narrow -
-- only what's needed to recognize "this is my booking" and act on it, same
-- pattern as the rest of the public booking RPCs (see script 028). The
-- reservation id itself is the access token, same as a password-reset link.
create or replace function public.get_public_reservation_status(p_reservation_id uuid)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
    'id', r.id,
    'status', r.status,
    'start_time', r.start_time,
    'client_name', c.name,
    'service_name', s.name,
    'business_name', b.name,
    'business_timezone', b.timezone,
    'cancellation_policy_hours', b.cancellation_policy_hours
  )
  from public.reservations r
  join public.clients c on c.id = r.client_id
  join public.services s on s.id = r.service_id
  join public.businesses b on b.id = r.business_id
  where r.id = p_reservation_id;
$$;

create or replace function public.cancel_public_reservation(p_reservation_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from public.reservations where id = p_reservation_id;

  if v_status is null then
    return json_build_object('error', 'not_found');
  end if;

  if v_status not in ('pending', 'confirmed') then
    return json_build_object('error', 'not_cancellable');
  end if;

  update public.reservations
  set status = 'cancelled', cancelled_by = 'client', cancelled_at = now()
  where id = p_reservation_id;

  return json_build_object('success', true);
end;
$$;

revoke all on function public.get_public_reservation_status(uuid) from public;
revoke all on function public.cancel_public_reservation(uuid) from public;

grant execute on function public.get_public_reservation_status(uuid) to anon, authenticated;
grant execute on function public.cancel_public_reservation(uuid) to anon, authenticated;
