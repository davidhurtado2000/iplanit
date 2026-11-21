-- Client recognition v1 (2026-11-20): who a PUBLIC booking is attached to.
--
-- Before: create_public_reservation matched the client by document, then email,
-- then phone, took the first hit (no ORDER BY, so any of several duplicates) and
-- NEVER looked at the name typed. Two different people sharing a phone or an
-- email (a family, an assistant booking for a boss) were merged into one
-- client: wrong name on the appointment, wrong no-show history, the
-- confirmation in the wrong inbox.
--
-- Now: ONE matcher, public.find_public_client, used by the booking:
--   * evidence in the same order (document > email > phone);
--   * a match only counts if the name typed does not clearly contradict the
--     name on file (public.client_names_compatible, mirrored and tested in
--     lib/client-match.ts); a rejected match falls through to the next
--     evidence and, if nothing is left, a NEW client is created;
--   * deterministic: active before inactive, then the oldest, then id;
--   * walk-in clients ("Cliente de paso") are never matched;
--   * advisory locks (per organization + document/email/phone, always taken in
--     the same order) so two simultaneous bookings cannot create the same new
--     client twice;
--   * indexed lookups (the old query ran a function over every client).
-- The reservation records how it was resolved in client_match_reason:
--   'document' | 'email' | 'phone' | 'new' | 'new:name_mismatch'
-- ('new:name_mismatch' = a contact matched but the name did not: the cases to
-- review later).
--
-- What does NOT change: the booking flow, prices, availability, emails, and the
-- rule that a match only fills blank email/phone/document (never overwrites).
--
-- Safe to run: new helper functions, three indexes (tiny table), one nullable
-- column, and ONE replace of create_public_reservation, generated from the exact
-- text of scripts/118. If anything misbehaves, run scripts/124-rollback.sql.
-- Run at night, then make a test booking on a business of yours.

-- ============================== PART 1: schema ===============================
alter table public.reservations add column if not exists client_match_reason text;

create or replace function public.phone_digits(p_phone text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
$$;

create index if not exists clients_org_email_idx on public.clients (organization_id, lower(btrim(email)));
create index if not exists clients_org_phone_idx on public.clients (organization_id, public.phone_digits(phone));
create index if not exists clients_org_document_idx on public.clients (organization_id, document_number);

-- ============================ PART 2: the name rule ===========================
-- "María José de la Cruz" -> {maria,jose,cruz}: no accents, no case, no
-- punctuation, no one-letter initials, no particles.
create or replace function public.client_name_tokens(p_name text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(t order by ord), array[]::text[])
  from unnest(
    string_to_array(
      trim(regexp_replace(
        lower(translate(
          coalesce(p_name, ''),
          'ÁÀÄÂáàäâÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔóòöôÚÙÜÛúùüûÑñ',
          'aaaaaaaaeeeeeeeeiiiiiiiioooooooouuuuuuuunn'
        )),
        '[^a-z ]', ' ', 'g'
      )),
      ' '
    )
  ) with ordinality as x(t, ord)
  where length(t) >= 2 and t not in ('de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'di', 'van', 'von');
$$;

-- Could these two names be the same person? Says "no" only when they clearly
-- differ; sharing just a SURNAME is not enough (that is a family on one phone).
create or replace function public.client_names_compatible(p_a text, p_b text)
returns boolean
language plpgsql
immutable
as $$
declare
  ta text[] := public.client_name_tokens(p_a);
  tb text[] := public.client_name_tokens(p_b);
begin
  if coalesce(cardinality(ta), 0) = 0 or coalesce(cardinality(tb), 0) = 0 then
    return true;
  end if;
  -- a shared word that is the given name (first word) of either
  if ta[1] = any(tb) or tb[1] = any(ta) then
    return true;
  end if;
  -- a shortened given name (3+ letters): "alex" / "alexander"
  if length(ta[1]) >= 3 and exists (select 1 from unnest(tb) x where x like ta[1] || '%') then
    return true;
  end if;
  if length(tb[1]) >= 3 and exists (select 1 from unnest(ta) x where x like tb[1] || '%') then
    return true;
  end if;
  return false;
end;
$$;

-- ============================ PART 3: the matcher ============================
-- Internal: only create_public_reservation (security definer) calls it, so it is
-- deliberately NOT granted to anon/authenticated (the old public lookup leaked
-- names, see scripts/123).
create or replace function public.find_public_client(
  p_organization_id uuid,
  p_country text,
  p_name text,
  p_email text,
  p_phone text,
  p_document text
)
returns table (client_id uuid, reason text, skip_document boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := nullif(lower(btrim(p_email)), '');
  v_doc text := nullif(btrim(p_document), '');
  v_phone_n text := public.normalize_phone_for_matching(p_phone, p_country);
  v_phone_alt text;
  v_id uuid;
  v_rejected boolean := false;
  v_skip_doc boolean := false;
begin
  -- Same order every time, so two bookings can never wait on each other.
  if v_doc is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || '|doc|' || v_doc, 0));
  end if;
  if v_email is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || '|email|' || v_email, 0));
  end if;
  if v_phone_n is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || '|phone|' || v_phone_n, 0));
  end if;

  -- 1. document
  if v_doc is not null then
    select c.id into v_id
    from public.clients c
    where c.organization_id = p_organization_id
      and c.document_number = v_doc
      and coalesce(c.is_walk_in, false) = false
      and public.client_names_compatible(c.name, p_name)
    order by coalesce(c.is_active, true) desc, c.created_at, c.id
    limit 1;
    if v_id is not null then
      return query select v_id, 'document'::text, false;
      return;
    end if;
    if exists (
      select 1 from public.clients c
      where c.organization_id = p_organization_id and c.document_number = v_doc and coalesce(c.is_walk_in, false) = false
    ) then
      v_rejected := true;
      v_skip_doc := true;
    end if;
  end if;

  -- 2. email
  if v_email is not null then
    select c.id into v_id
    from public.clients c
    where c.organization_id = p_organization_id
      and lower(btrim(c.email)) = v_email
      and coalesce(c.is_walk_in, false) = false
      and public.client_names_compatible(c.name, p_name)
    order by coalesce(c.is_active, true) desc, c.created_at, c.id
    limit 1;
    if v_id is not null then
      return query select v_id, 'email'::text, false;
      return;
    end if;
    if exists (
      select 1 from public.clients c
      where c.organization_id = p_organization_id and lower(btrim(c.email)) = v_email and coalesce(c.is_walk_in, false) = false
    ) then
      v_rejected := true;
    end if;
  end if;

  -- 3. phone. phone_digits() is what the index holds; a stored number may be
  -- with or without the country code, so both forms are looked up and the
  -- exact old comparison (normalize_phone_for_matching) is applied to the few
  -- rows found.
  if v_phone_n is not null then
    v_phone_alt := case
      when p_country = 'PE' and v_phone_n ~ '^51[0-9]{9}$' then substr(v_phone_n, 3)
      when p_country = 'US' and v_phone_n ~ '^1[0-9]{10}$' then substr(v_phone_n, 2)
    end;
    select c.id into v_id
    from public.clients c
    where c.organization_id = p_organization_id
      and public.phone_digits(c.phone) in (v_phone_n, v_phone_alt)
      and public.normalize_phone_for_matching(c.phone, p_country) = v_phone_n
      and coalesce(c.is_walk_in, false) = false
      and public.client_names_compatible(c.name, p_name)
    order by coalesce(c.is_active, true) desc, c.created_at, c.id
    limit 1;
    if v_id is not null then
      return query select v_id, 'phone'::text, false;
      return;
    end if;
    if exists (
      select 1 from public.clients c
      where c.organization_id = p_organization_id
        and public.phone_digits(c.phone) in (v_phone_n, v_phone_alt)
        and public.normalize_phone_for_matching(c.phone, p_country) = v_phone_n
        and coalesce(c.is_walk_in, false) = false
    ) then
      v_rejected := true;
    end if;
  end if;

  return query select null::uuid, case when v_rejected then 'new:name_mismatch' else 'new' end, v_skip_doc;
end;
$$;

revoke all on function public.find_public_client(uuid, text, text, text, text, text) from public;
revoke all on function public.client_name_tokens(text) from public;
revoke all on function public.client_names_compatible(text, text) from public;

-- ===================== PART 4: the booking uses the matcher ====================
-- scripts/118's function with ONE block replaced (the client lookup) and the
-- reservation insert saving client_match_reason. Everything else is the same.
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
  p_document_number text default null,
  p_worker_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_business_country text;
  v_business_tz text;
  v_organization_id uuid;
  v_client_chooses_worker boolean;
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
  v_client_chooses_resource boolean;
  v_buffer_before int;
  v_buffer_after int;
  v_worker_id uuid;
  v_candidate uuid;
  v_has_eligible boolean;
  v_no_pref_mode text;
  v_auto_assigned boolean := false;
  v_pool boolean := false;
  v_eligible int;
  v_match_reason text;
  v_skip_document boolean := false;
begin
  if p_start_time < now() then
    return json_build_object('error', 'time_in_past');
  end if;

  select id, country, organization_id, timezone, client_chooses_worker, no_preference_mode
    into v_business_id, v_business_country, v_organization_id, v_business_tz, v_client_chooses_worker, v_no_pref_mode
  from public.businesses where slug = p_slug;
  if v_business_id is null then
    return json_build_object('error', 'business_not_found');
  end if;

  select pricing_mode, client_chooses_resource, buffer_before_min, buffer_after_min
    into v_pricing_mode, v_client_chooses_resource, v_buffer_before, v_buffer_after
  from public.services
  where id = p_service_id
    and business_id = v_business_id
    and is_active = true
    and visible_on_public_link = true;

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
    where id = p_service_id and business_id = v_business_id and is_active = true and visible_on_public_link = true;

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

  if p_resource_id is null and v_client_chooses_resource is false then
    select r.id into p_resource_id
    from public.service_resources sr
    join public.resources r on r.id = sr.resource_id and r.is_active
    where sr.service_id = p_service_id
      and not exists (
        select 1 from public.reservations res
        where res.resource_id = r.id
          and res.status <> 'cancelled'
          and res.start_time < v_end_time
          and res.end_time > p_start_time
      )
      and not exists (
        select 1 from public.time_block_ranges(v_business_id, p_start_time, v_end_time) b
        where b.resource_id = r.id and b.start_at < v_end_time and b.end_at > p_start_time
      )
    order by r.name
    limit 1;
  end if;

  -- Time blocks (scripts/107): a business-wide block (lunch, unexpected
  -- closure) or one on the resource being booked rejects the slot.
  -- Worker-specific blocks are checked inside worker_can_take_booking.
  if exists (
    select 1 from public.time_block_ranges(v_business_id, p_start_time, v_end_time) b
    where b.start_at < v_end_time and b.end_at > p_start_time
      and (
        (b.worker_id is null and b.resource_id is null)
        or (p_resource_id is not null and b.resource_id = p_resource_id)
      )
  ) then
    return json_build_object('error', 'time_blocked');
  end if;

  -- Worker selection - before any client insert below, so a rejected
  -- booking never leaves an orphan client row behind.
  if v_client_chooses_worker then
    if p_worker_id is not null then
      if v_no_pref_mode = 'pool' then
        perform pg_advisory_xact_lock(hashtextextended('pool:' || v_business_id::text, 0));
      end if;
      perform pg_advisory_xact_lock(hashtextextended('worker:' || p_worker_id::text, 0));
      if not public.worker_can_take_booking(
        p_worker_id, v_business_id, p_service_id, p_start_time, v_end_time, v_buffer_before, v_buffer_after
      ) then
        return json_build_object('error', 'worker_unavailable');
      end if;
      v_worker_id := p_worker_id;
      if v_no_pref_mode = 'pool'
         and public.pool_free_workers(v_business_id, p_service_id, p_start_time, v_end_time, v_buffer_before, v_buffer_after)
             <= public.pool_booking_count(v_business_id, p_start_time, v_end_time, v_buffer_before, v_buffer_after) then
        return json_build_object('error', 'worker_unavailable');
      end if;
    elsif v_no_pref_mode = 'pool' then
      -- "Sin preferencia" as a real pool: no barber is assigned (and no
      -- barber's time is taken) until reception picks one, but the booking
      -- uses one unit of capacity, so it's only accepted while there are
      -- more free barbers than pool bookings at that time.
      perform pg_advisory_xact_lock(hashtextextended('pool:' || v_business_id::text, 0));
      select count(*) into v_eligible
      from public.workers w
      where w.business_id = v_business_id
        and w.is_active = true
        and (
          not exists (select 1 from public.worker_services ws where ws.worker_id = w.id)
          or exists (select 1 from public.worker_services ws where ws.worker_id = w.id and ws.service_id = p_service_id)
        );
      if v_eligible > 0 then
        if public.pool_free_workers(v_business_id, p_service_id, p_start_time, v_end_time, v_buffer_before, v_buffer_after)
           <= public.pool_booking_count(v_business_id, p_start_time, v_end_time, v_buffer_before, v_buffer_after) then
          return json_build_object('error', 'worker_unavailable');
        end if;
        v_pool := true;
      end if;
    else
      v_has_eligible := false;
      for v_candidate in
        select w.id
        from public.workers w
        where w.business_id = v_business_id
          and w.is_active = true
          and (
            not exists (select 1 from public.worker_services ws where ws.worker_id = w.id)
            or exists (select 1 from public.worker_services ws where ws.worker_id = w.id and ws.service_id = p_service_id)
          )
        order by (
          select count(*) from public.reservations r
          where r.worker_id = w.id
            and r.status <> 'cancelled'
            and (r.start_time at time zone v_business_tz)::date = (p_start_time at time zone v_business_tz)::date
        ), w.name
      loop
        v_has_eligible := true;
        perform pg_advisory_xact_lock(hashtextextended('worker:' || v_candidate::text, 0));
        if public.worker_can_take_booking(
          v_candidate, v_business_id, p_service_id, p_start_time, v_end_time, v_buffer_before, v_buffer_after
        ) then
          v_worker_id := v_candidate;
          exit;
        end if;
      end loop;

      if v_has_eligible and v_worker_id is null then
        return json_build_object('error', 'worker_unavailable');
      end if;

      -- "Sin preferencia" and the business wants to review who got it
      -- (businesses.no_preference_mode = 'auto_review'): the barber chosen
      -- above is real and holds the time, but the booking is flagged so
      -- reception can confirm or change it.
      if v_worker_id is not null then
        v_auto_assigned := coalesce(v_no_pref_mode, 'auto') = 'auto_review';
      end if;
    end if;
  end if;

  if p_needs_parking then
    v_parking_resource_id := public.find_available_parking_resource(v_business_id, p_start_time, v_end_time);
    if v_parking_resource_id is null then
      return json_build_object('error', 'parking_unavailable');
    end if;
  end if;

  v_document_number := nullif(trim(p_document_number), '');

  -- Who is this? (scripts/124) Document, then email, then phone, each one only
  -- if the name typed does not clearly contradict the name on file (a shared
  -- phone or email between two different people no longer merges them). Also
  -- takes the locks that keep two simultaneous bookings from creating the same
  -- new client twice. v_match_reason is saved on the reservation.
  select m.client_id, m.reason, m.skip_document
    into v_client_id, v_match_reason, v_skip_document
  from public.find_public_client(
    v_organization_id, v_business_country, p_client_name, p_client_email, p_client_phone, v_document_number
  ) m;

  -- A document that belongs to someone with another name is not copied onto
  -- the new client: two clients must not share the same DNI.
  if v_skip_document then
    v_document_number := null;
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
      (business_id, client_id, service_id, resource_id, worker_id, start_time, end_time, status, notes, price, price_usd, parking_resource_id, worker_auto_assigned, no_preference_pool, client_match_reason)
    values
      (v_business_id, v_client_id, p_service_id, p_resource_id, v_worker_id, p_start_time, v_end_time, 'pending', nullif(trim(p_notes), ''), v_price, v_price_usd, v_parking_resource_id, v_auto_assigned, v_pool, v_match_reason)
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

revoke all on function public.create_public_reservation(text, uuid, uuid, timestamptz, text, text, text, text, uuid, boolean, integer, text, uuid) from public;
grant execute on function public.create_public_reservation(text, uuid, uuid, timestamptz, text, text, text, text, uuid, boolean, integer, text, uuid) to anon, authenticated;
