-- Per-business look for the public booking link (first real client asked
-- for "their" style). Deliberately a curated choice, not free-form: a font
-- key from a fixed list (lib/booking-fonts.ts - display/headings only, body
-- text stays the legible default) and one accent color. Arbitrary uploaded
-- fonts or full theming would make it easy to end up with an unreadable
-- page. Null = the default iPlanit booking look, exactly as before.
alter table public.businesses
  add column if not exists booking_font text,
  add column if not exists booking_accent_color text;

alter table public.businesses
  drop constraint if exists businesses_booking_font_check;
alter table public.businesses
  add constraint businesses_booking_font_check
  check (booking_font is null or booking_font in (
    'sora', 'playfair', 'oswald', 'bebas', 'montserrat', 'lora', 'abril', 'nunito'
  ));

alter table public.businesses
  drop constraint if exists businesses_booking_accent_color_check;
alter table public.businesses
  add constraint businesses_booking_accent_color_check
  check (booking_accent_color is null or booking_accent_color ~ '^#[0-9a-fA-F]{6}$');

-- get_public_business (latest prior: scripts/102) - adds both fields.
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
    'booking_accent_color', booking_accent_color
  )
  from public.businesses
  where slug = p_slug
  limit 1;
$$;

revoke all on function public.get_public_business(text) from public;
grant execute on function public.get_public_business(text) to anon, authenticated;
