-- create_public_reservation matched an existing client by phone using exact
-- text equality - "999888777", "+51 999 888 777" and "999-888-777" are the
-- same real person but three different strings, so formatting differences
-- alone were creating duplicate client records. Comparing digits-only
-- (stripping spaces/dashes/parens/plus) fixes the common case without
-- guessing at country codes, which would risk merging two genuinely
-- different people's numbers instead of just tolerating formatting.
-- Email matching (already case-insensitive) and everything else in this
-- function is unchanged - only the phone lookup's comparison changed, and
-- phone numbers are still stored exactly as the client typed them so
-- nothing changes in how staff see them in Clientes.
--
-- Same signature as script 037's version, so this is a plain CREATE OR
-- REPLACE - no DROP needed.
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
  p_hours integer default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
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
begin
  if p_start_time < now() then
    return json_build_object('error', 'time_in_past');
  end if;

  select id into v_business_id from public.businesses where slug = p_slug;
  if v_business_id is null then
    return json_build_object('error', 'business_not_found');
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

  if p_client_email is not null and trim(p_client_email) <> '' then
    select id into v_client_id from public.clients
    where business_id = v_business_id and lower(email) = lower(trim(p_client_email))
    limit 1;
  end if;

  if v_client_id is null and p_client_phone is not null and trim(p_client_phone) <> '' then
    select id into v_client_id from public.clients
    where business_id = v_business_id
      and phone is not null
      and regexp_replace(phone, '[^0-9]', '', 'g') = regexp_replace(trim(p_client_phone), '[^0-9]', '', 'g')
      and regexp_replace(trim(p_client_phone), '[^0-9]', '', 'g') <> ''
    limit 1;
  end if;

  if v_client_id is null then
    insert into public.clients (business_id, name, email, phone)
    values (v_business_id, trim(p_client_name), nullif(trim(p_client_email), ''), nullif(trim(p_client_phone), ''))
    returning id into v_client_id;
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
  end;

  return json_build_object('success', true, 'reservation_id', v_reservation_id);
end;
$$;
