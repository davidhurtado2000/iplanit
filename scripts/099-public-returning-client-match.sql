-- Option A from the client-accounts conversation: no login, no accounts -
-- just recognize a returning client earlier, while they're still typing
-- their contact info on the public booking link, instead of only silently
-- matching them server-side after they already submit (create_public_
-- reservation already does that matching - this exposes a read-only,
-- name-only preview of the same lookup so the page can offer to fill the
-- form for them). Kept deliberately minimal: no client history, no
-- reservation details, no document number - just enough to let someone
-- confirm "yes, that's me" and skip retyping their name.
create or replace function public.find_public_client_match(
  p_slug text,
  p_email text default null,
  p_phone text default null,
  p_document_number text default null
)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_business_country text;
  v_client record;
begin
  select organization_id, country into v_organization_id, v_business_country
  from public.businesses where slug = p_slug;
  if v_organization_id is null then
    return json_build_object('match', false);
  end if;

  -- Same document -> email -> phone priority as create_public_reservation
  -- (scripts/064/098), so whichever field the page finds a match on here
  -- is the same one that would actually attach the reservation to that
  -- client on submit - no surprises between the preview and the real save.
  if p_document_number is not null and trim(p_document_number) <> '' then
    select name, email, phone into v_client
    from public.clients
    where organization_id = v_organization_id and document_number = trim(p_document_number)
    limit 1;
  end if;

  if v_client is null and p_email is not null and trim(p_email) <> '' then
    select name, email, phone into v_client
    from public.clients
    where organization_id = v_organization_id and lower(email) = lower(trim(p_email))
    limit 1;
  end if;

  if v_client is null and p_phone is not null and trim(p_phone) <> '' then
    select name, email, phone into v_client
    from public.clients
    where organization_id = v_organization_id
      and phone is not null
      and public.normalize_phone_for_matching(phone, v_business_country) = public.normalize_phone_for_matching(p_phone, v_business_country)
      and public.normalize_phone_for_matching(p_phone, v_business_country) is not null
    limit 1;
  end if;

  if v_client is null then
    return json_build_object('match', false);
  end if;

  return json_build_object('match', true, 'name', v_client.name, 'email', v_client.email, 'phone', v_client.phone);
end;
$$;

revoke all on function public.find_public_client_match(text, text, text, text) from public;
grant execute on function public.find_public_client_match(text, text, text, text) to anon, authenticated;
