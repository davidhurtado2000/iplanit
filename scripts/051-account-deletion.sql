-- Account deletion with a 30-day grace period. Nothing is deleted at
-- request time - deletion_requested_at is just a marker; the actual
-- destructive work (cancelling upcoming reservations' clients via email,
-- cancelling any Stripe subscription, and finally auth.admin.deleteUser())
-- happens in app/api/cron/purge-deleted-accounts, run daily via GitHub
-- Actions, once 30 days have passed and nobody logged back in to cancel.
--
-- Every FK in this schema that points at profiles(id)/businesses(id) is
-- ON DELETE CASCADE (confirmed by reviewing every prior script) - so
-- calling auth.admin.deleteUser() on a business owner silently destroys
-- the entire business (reservations, clients, services, resources) with
-- zero DB-level safety net. The grace period + explicit confirmation in
-- the UI is the only protection against an accidental/impulsive deletion -
-- Postgres itself won't stop it.

alter table public.profiles
  add column if not exists deletion_requested_at timestamptz;

-- Same reasoning as the plan/stripe_* REVOKE in scripts/049: this column
-- now controls something with real, hard-to-reverse consequences, so it
-- shouldn't be writable directly through the anon/authenticated client -
-- only through /api/account/delete and /api/account/cancel-deletion,
-- which use the service role after verifying the caller's own session.
revoke update (deletion_requested_at) on public.profiles from authenticated;

-- Blocks new public bookings for a business whose owner has requested
-- deletion - continuing to accept reservations for a business that's
-- about to disappear would just create more appointments needing the
-- cancellation-notice treatment below. create_public_reservation (current
-- version, scripts/048) already checks service/resource/business
-- existence up front - this adds one more existence-style check in the
-- same place, no new signature needed.
create or replace function public.is_business_accepting_reservations(p_business_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select not exists (
    select 1 from public.businesses b
    join public.profiles p on p.id = b.owner_id
    where b.id = p_business_id and p.deletion_requested_at is not null
  );
$$;

-- Purge cron: which accounts have finished their grace period.
create or replace function public.get_accounts_ready_for_deletion()
returns table (user_id uuid, stripe_subscription_id text)
language sql
security definer
stable
set search_path = public
as $$
  select id, stripe_subscription_id
  from public.profiles
  where deletion_requested_at is not null
    and deletion_requested_at <= now() - interval '30 days';
$$;

-- Purge cron: for one about-to-be-deleted owner, every upcoming
-- reservation whose client should get a cancellation notice before the
-- business (and the reservation itself) disappears for good. Mirrors
-- get_reservations_needing_reminders()'s shape so the cron route can
-- reuse the exact same buildCancellationEmail/Resend call it already has.
create or replace function public.get_reservations_needing_deletion_notice(p_user_id uuid)
returns table (
  reservation_id uuid,
  client_email text,
  client_name text,
  service_name text,
  business_name text,
  business_timezone text,
  business_country text,
  start_time timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select r.id, c.email, c.name, s.name, b.name, b.timezone, b.country, r.start_time
  from public.reservations r
  join public.businesses b on b.id = r.business_id
  join public.clients c on c.id = r.client_id
  left join public.services s on s.id = r.service_id
  where b.owner_id = p_user_id
    and r.status in ('pending', 'confirmed')
    and r.start_time > now()
    and c.email is not null;
$$;

revoke all on function public.is_business_accepting_reservations(uuid) from public;
grant execute on function public.is_business_accepting_reservations(uuid) to anon, authenticated;

revoke all on function public.get_accounts_ready_for_deletion() from public;
grant execute on function public.get_accounts_ready_for_deletion() to service_role;

revoke all on function public.get_reservations_needing_deletion_notice(uuid) from public;
grant execute on function public.get_reservations_needing_deletion_notice(uuid) to service_role;

-- create_public_reservation (script 048's version, same signature - plain
-- CREATE OR REPLACE) now also blocks new bookings once the business owner
-- has requested deletion.
create or replace function public.create_public_reservation(
  p_slug text,
  p_service_id uuid,
  p_resource_id uuid,
  p_start_time timestamptz,
  p_client_name text,
  p_client_email text,
  p_client_phone text,
  p_notes text,
  p_duration_option_id uuid default null,
  p_needs_parking boolean default false,
  p_hours integer default null,
  p_document_number text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_business_country text;
  v_pricing_mode text;
  v_min_hours int;
  v_max_hours int;
  v_hourly_rate numeric;
  v_hourly_rate_usd numeric;
  v_duration int;
  v_price numeric;
  v_price_usd numeric;
  v_end_time timestamptz;
  v_client_id uuid;
  v_reservation_id uuid;
  v_parking_resource_id uuid;
  v_document_number text;
  v_document_type text;
begin
  if p_start_time < now() then
    return json_build_object('error', 'time_in_past');
  end if;

  select id, country into v_business_id, v_business_country from public.businesses where slug = p_slug;
  if v_business_id is null then
    return json_build_object('error', 'business_not_found');
  end if;

  if not public.is_business_accepting_reservations(v_business_id) then
    return json_build_object('error', 'business_unavailable');
  end if;

  select pricing_mode into v_pricing_mode
  from public.services
  where id = p_service_id and business_id = v_business_id and is_active = true;

  if v_pricing_mode is null then
    return json_build_object('error', 'service_not_found');
  end if;

  if v_pricing_mode = 'hourly' then
    select min_hours, max_hours, hourly_rate, hourly_rate_usd
      into v_min_hours, v_max_hours, v_hourly_rate, v_hourly_rate_usd
    from public.services
    where id = p_service_id;

    if p_hours is null or p_hours < coalesce(v_min_hours, 1) or p_hours > coalesce(v_max_hours, 24) then
      return json_build_object('error', 'invalid_hours');
    end if;

    v_duration := p_hours * 60;
    v_price := case when v_hourly_rate is not null then v_hourly_rate * p_hours end;
    v_price_usd := case when v_hourly_rate_usd is not null then v_hourly_rate_usd * p_hours end;

  elsif v_pricing_mode = 'preset' then
    if p_duration_option_id is null then
      return json_build_object('error', 'duration_option_not_found');
    end if;

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

  if p_needs_parking then
    v_parking_resource_id := public.find_available_parking_resource(v_business_id, p_start_time, v_end_time);
    if v_parking_resource_id is null then
      return json_build_object('error', 'parking_unavailable');
    end if;
  end if;

  v_document_number := nullif(trim(p_document_number), '');

  if v_document_number is not null then
    select id into v_client_id from public.clients
    where business_id = v_business_id and document_number = v_document_number
    limit 1;
  end if;

  if v_client_id is null and p_client_email is not null and trim(p_client_email) <> '' then
    select id into v_client_id from public.clients
    where business_id = v_business_id and lower(email) = lower(trim(p_client_email))
    limit 1;
  end if;

  if v_client_id is null and p_client_phone is not null and trim(p_client_phone) <> '' then
    select id into v_client_id from public.clients
    where business_id = v_business_id
      and phone is not null
      and public.normalize_phone_for_matching(phone, v_business_country) = public.normalize_phone_for_matching(p_client_phone, v_business_country)
      and public.normalize_phone_for_matching(p_client_phone, v_business_country) is not null
    limit 1;
  end if;

  if v_client_id is null then
    v_document_type := case when v_document_number is not null then
      case when v_business_country = 'US' then 'ein' else 'dni' end
    end;

    insert into public.clients (business_id, name, email, phone, document_number, document_type)
    values (
      v_business_id,
      trim(p_client_name),
      nullif(trim(p_client_email), ''),
      nullif(trim(p_client_phone), ''),
      v_document_number,
      v_document_type
    )
    returning id into v_client_id;
  elsif v_document_number is not null then
    update public.clients
    set document_number = v_document_number,
        document_type = coalesce(document_type, case when v_business_country = 'US' then 'ein' else 'dni' end)
    where id = v_client_id and document_number is null;
  end if;

  begin
    insert into public.reservations
      (business_id, client_id, service_id, resource_id, start_time, end_time, status, notes, price, price_usd, parking_resource_id)
    values
      (v_business_id, v_client_id, p_service_id, p_resource_id, p_start_time, v_end_time, 'pending', nullif(trim(p_notes), ''), v_price, v_price_usd, v_parking_resource_id)
    returning id into v_reservation_id;
  exception
    when exclusion_violation then
      return json_build_object('error', 'time_conflict');
    when sqlstate 'PLN01' then
      return json_build_object('error', 'business_reservation_limit_reached');
  end;

  return json_build_object('success', true, 'reservation_id', v_reservation_id);
end;
$$;
