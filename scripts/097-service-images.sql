-- Optional reference photo per service, shown on the public booking link
-- so a client sees what they're actually booking instead of just a name
-- and duration - David's own Fresha comparison. Nullable, no default: a
-- service with no photo just shows its existing color-swatch placeholder,
-- same as today.
alter table public.services
  add column if not exists image_url text;

-- Storage bucket + policies, same shape as scripts/039-business-logo-
-- storage.sql, but write access follows the same owner/admin rule as
-- editing the service itself (scripts/032-granular-roles.sql) rather than
-- an owner-only check - service management already isn't owner-exclusive.
-- Files are stored as {business_id}/{random}.{ext} (not {service_id}/...)
-- because a brand-new service doesn't have an id yet at the moment its
-- image is picked in the create form - the URL is attached to the service
-- row on save, same as every other field in that form.
insert into storage.buckets (id, name, public, file_size_limit)
values ('service-images', 'service-images', true, 2097152)
on conflict (id) do nothing;

drop policy if exists "Service images are publicly accessible" on storage.objects;
create policy "Service images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'service-images');

drop policy if exists "Owner/admin can upload service images" on storage.objects;
create policy "Owner/admin can upload service images"
  on storage.objects for insert
  with check (
    bucket_id = 'service-images'
    and public.business_member_role(((storage.foldername(name))[1])::uuid) in ('owner', 'admin')
  );

drop policy if exists "Owner/admin can update service images" on storage.objects;
create policy "Owner/admin can update service images"
  on storage.objects for update
  using (
    bucket_id = 'service-images'
    and public.business_member_role(((storage.foldername(name))[1])::uuid) in ('owner', 'admin')
  );

drop policy if exists "Owner/admin can delete service images" on storage.objects;
create policy "Owner/admin can delete service images"
  on storage.objects for delete
  using (
    bucket_id = 'service-images'
    and public.business_member_role(((storage.foldername(name))[1])::uuid) in ('owner', 'admin')
  );

-- get_public_services (scripts 028/034/037/040/095/096) - same shape, add
-- image_url so the public page can show it (falls back to its own
-- color-swatch placeholder client-side when null, no change needed here
-- for that part).
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
      'image_url', s.image_url,
      'pricing_mode', s.pricing_mode,
      'hourly_rate', s.hourly_rate,
      'hourly_rate_usd', s.hourly_rate_usd,
      'min_hours', s.min_hours,
      'max_hours', s.max_hours,
      'buffer_before_min', s.buffer_before_min,
      'buffer_after_min', s.buffer_after_min,
      'client_chooses_resource', s.client_chooses_resource,
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
