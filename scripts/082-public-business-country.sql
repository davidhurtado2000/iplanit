-- The public booking page's phone field now defaults its country-code
-- toggle (script accompanying components/ui/phone-input.tsx) to the
-- business's own country, same prior for the dashboard-side client forms.
-- get_public_business (scripts 028/035/041) didn't expose country at all -
-- CREATE OR REPLACE fully overwrites the function body, so every field from
-- every prior version has to be carried forward explicitly here or it
-- silently disappears from the response.
create or replace function public.get_public_business(p_slug text)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
    'id', id,
    'name', name,
    'description', description,
    'address', address,
    'phone', phone,
    'timezone', timezone,
    'logo_url', logo_url,
    'offers_parking', offers_parking,
    'notify_confirmations', notify_confirmations,
    'country', country
  )
  from public.businesses
  where slug = p_slug
  limit 1;
$$;

revoke all on function public.get_public_business(text) from public;
grant execute on function public.get_public_business(text) to anon, authenticated;
