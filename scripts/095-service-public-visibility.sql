-- "Some services need a conversation first, before they can be booked" -
-- David's own example: a custom quote, a complex consultation. Until now
-- every active service showed on the public booking link with no way to
-- exclude one. Off (true, i.e. visible) by default so nothing already
-- live changes - this is purely additive.
alter table public.services
  add column if not exists visible_on_public_link boolean not null default true;

comment on column public.services.visible_on_public_link is
  'When false, this service is hidden from the public booking link (app/reservar) but still usable for reservations created internally from the dashboard. Does not affect is_active.';

-- get_public_services (scripts 028/034/037/040) - same shape, just add the
-- visibility filter alongside the existing is_active one.
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
      'pricing_mode', s.pricing_mode,
      'hourly_rate', s.hourly_rate,
      'hourly_rate_usd', s.hourly_rate_usd,
      'min_hours', s.min_hours,
      'max_hours', s.max_hours,
      'buffer_before_min', s.buffer_before_min,
      'buffer_after_min', s.buffer_after_min,
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
  where s.business_id = p_business_id and s.is_active = true and s.visible_on_public_link = true;
$$;
