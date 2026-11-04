-- Background color for the public booking link (asked for by Carppone: the
-- embed's stock navy background clashed with their near-black website).
-- One #rrggbb color; the page derives cards, borders and light-vs-dark text
-- from it (lib/booking-fonts.ts), so a business can't end up with an
-- unreadable combination. Null = the default look that follows the
-- visitor's own light/dark setting, exactly as before.
-- When set, the embedded version (?embed=1) also drops its own background
-- so it blends into the host website.
alter table public.businesses
  add column if not exists booking_bg_color text;

alter table public.businesses
  drop constraint if exists businesses_booking_bg_color_check;
alter table public.businesses
  add constraint businesses_booking_bg_color_check
  check (booking_bg_color is null or booking_bg_color ~ '^#[0-9a-fA-F]{6}$');

-- get_public_business (latest prior: scripts/103) - adds booking_bg_color.
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
    'country', country,
    'client_chooses_worker', client_chooses_worker,
    'booking_font', booking_font,
    'booking_accent_color', booking_accent_color,
    'booking_bg_color', booking_bg_color
  )
  from public.businesses
  where slug = p_slug
  limit 1;
$$;

revoke all on function public.get_public_business(text) from public;
grant execute on function public.get_public_business(text) to anon, authenticated;

-- get_public_reservation_status (latest prior: scripts/105) - adds
-- booking_bg_color so "Ver o cancelar mi reserva" matches the booking link.
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
    'reservation_type', r.type,
    'start_time', r.start_time,
    'client_name', c.name,
    'client_email', c.email,
    'service_name', s.name,
    'business_name', b.name,
    'business_timezone', b.timezone,
    'cancellation_policy_hours', b.cancellation_policy_hours,
    'has_parking', r.parking_resource_id is not null,
    'notify_confirmations', b.notify_confirmations,
    'notify_cancellations', b.notify_cancellations,
    'worker_name', w.name,
    'worker_photo_url', w.photo_url,
    'booking_font', b.booking_font,
    'booking_accent_color', b.booking_accent_color,
    'booking_bg_color', b.booking_bg_color,
    'attendees', (
      select coalesce(json_agg(json_build_object('name', ac.name, 'email', ac.email)), '[]'::json)
      from public.reservation_attendees ra
      join public.clients ac on ac.id = ra.client_id
      where ra.reservation_id = r.id and ra.status = 'confirmed'
    )
  )
  from public.reservations r
  join public.clients c on c.id = r.client_id
  left join public.services s on s.id = r.service_id
  left join public.workers w on w.id = r.worker_id
  join public.businesses b on b.id = r.business_id
  where r.id = p_reservation_id;
$$;

revoke all on function public.get_public_reservation_status(uuid) from public;
grant execute on function public.get_public_reservation_status(uuid) to anon, authenticated;
