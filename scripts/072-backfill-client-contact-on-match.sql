-- create_public_reservation already recognizes a returning client by
-- document number, then email, then phone (see scripts/064-input-validation.sql)
-- - but when it found a match, it only ever backfilled a missing document
-- number onto that existing client, never a missing email/phone. So a
-- client who first booked with just a phone, then later typed their email
-- into the form on a second visit (recognized via that same phone), had
-- the email they just gave silently discarded - their record kept showing
-- a null email in the dashboard forever. This redefines the function so a
-- match backfills whatever contact info was missing, without ever
-- overwriting a value that's already on file.

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
  v_organization_id uuid;
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

  select id, country, organization_id into v_business_id, v_business_country, v_organization_id
  from public.businesses where slug = p_slug;
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

  -- Explicit length/format validation, ahead of any insert - matches the
  -- DB check constraints added above so a violation here always returns a
  -- clean error instead of an uncaught exception.
  if char_length(trim(p_client_name)) > 200 then
    return json_build_object('error', 'name_too_long');
  end if;

  if p_client_email is not null and trim(p_client_email) <> ''
     and trim(p_client_email) !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    return json_build_object('error', 'invalid_email');
  end if;

  if p_client_phone is not null and char_length(trim(p_client_phone)) > 30 then
    return json_build_object('error', 'phone_too_long');
  end if;

  if p_notes is not null and char_length(trim(p_notes)) > 2000 then
    return json_build_object('error', 'notes_too_long');
  end if;

  if p_document_number is not null and char_length(trim(p_document_number)) > 50 then
    return json_build_object('error', 'document_number_too_long');
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
    where organization_id = v_organization_id and document_number = v_document_number
    limit 1;
  end if;

  if v_client_id is null and p_client_email is not null and trim(p_client_email) <> '' then
    select id into v_client_id from public.clients
    where organization_id = v_organization_id and lower(email) = lower(trim(p_client_email))
    limit 1;
  end if;

  if v_client_id is null and p_client_phone is not null and trim(p_client_phone) <> '' then
    select id into v_client_id from public.clients
    where organization_id = v_organization_id
      and phone is not null
      and public.normalize_phone_for_matching(phone, v_business_country) = public.normalize_phone_for_matching(p_client_phone, v_business_country)
      and public.normalize_phone_for_matching(p_client_phone, v_business_country) is not null
    limit 1;
  end if;

  if v_client_id is null then
    v_document_type := case when v_document_number is not null then
      case when v_business_country = 'US' then 'ein' else 'dni' end
    end;

    insert into public.clients (organization_id, business_id, name, email, phone, document_number, document_type)
    values (
      v_organization_id,
      v_business_id,
      trim(p_client_name),
      nullif(trim(p_client_email), ''),
      nullif(trim(p_client_phone), ''),
      v_document_number,
      v_document_type
    )
    returning id into v_client_id;
  else
    -- Returning client, matched above by document/email/phone - fill in
    -- whatever contact info they just gave that wasn't on file yet.
    -- coalesce() only ever fills a null column; it never replaces a value
    -- that's already there, since a public booking form typed by the
    -- client isn't an authoritative place to silently overwrite existing
    -- real data (e.g. a mistyped email shouldn't clobber the real one).
    update public.clients
    set email = coalesce(email, nullif(trim(p_client_email), '')),
        phone = coalesce(phone, nullif(trim(p_client_phone), '')),
        document_number = coalesce(document_number, v_document_number),
        document_type = coalesce(
          document_type,
          case when v_document_number is not null then
            case when v_business_country = 'US' then 'ein' else 'dni' end
          end
        )
    where id = v_client_id;
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
