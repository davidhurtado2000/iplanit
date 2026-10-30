-- "Pedir reseña automáticamente" (V1 simple, per the Google review
-- conversation): just the Google review link, no internal rating storage.
-- The business pastes their own "write a review" link (Google Business
-- Profile -> Get more reviews -> generates it for them, no Place ID lookup
-- or Google API needed on our side). Presence of this field IS the on/off
-- switch - no separate notify toggle to explain, same idea as how the
-- embed widget just works once the business copies its snippet. Free on
-- every plan (David's call, 2026-10-21).
alter table public.businesses
  add column if not exists google_review_url text;

-- Tracks whether this specific reservation already got its request, same
-- pattern as reminder_sent_at/day_of_reminder_sent_at.
alter table public.reservations
  add column if not exists review_requested_at timestamptz;

-- status stays 'confirmed' forever unless a business bothers to manually
-- flip it to 'completed' (components/dashboard/reservation-modal.tsx's
-- "Marcar como completada" action) - most won't, so this can't gate on
-- status = 'completed' or it would almost never fire. Instead it fires once
-- the appointment's own end_time has passed, regardless of whether anyone
-- marked it complete. Excludes 'cancelled'/'no_show' (nothing to review)
-- and 'pending' (never confirmed, same exclusion reminders already use).
--
-- Two time bounds: a 3-hour floor (enough time to actually have left before
-- asking) and a 14-day ceiling - without the ceiling, the very first run
-- after this ships would try to email every historical reservation ever
-- made, which is both pointless (ancient appointments) and a spam risk.
create or replace function public.get_reservations_needing_review_request()
returns table (
  reservation_id uuid,
  client_email text,
  client_name text,
  business_name text,
  google_review_url text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    r.id, c.email, c.name, b.name, b.google_review_url
  from public.reservations r
  join public.clients c on c.id = r.client_id
  join public.businesses b on b.id = r.business_id
  where r.status in ('confirmed', 'completed')
    and r.review_requested_at is null
    and b.google_review_url is not null
    and c.email is not null
    and r.end_time <= now() - interval '3 hours'
    and r.end_time > now() - interval '14 days'
$$;

grant execute on function public.get_reservations_needing_review_request() to service_role;
