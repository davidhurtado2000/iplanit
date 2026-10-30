  -- get_public_reservation_status (latest prior: scripts/081) gains:
  --   * worker_name / worker_photo_url - so a "Sin preferencia" booking
  --     (scripts/102, server auto-assigns the barber) can tell the client who
  --     they got, on the success screen and on the manage page.
  --   * booking_font / booking_accent_color (scripts/103) - so the
  --     "Ver o cancelar mi reserva" page looks like the business's own
  --     booking link instead of the stock palette.
  -- Same json return type, so a plain create or replace is enough. Nothing
  -- here is more sensitive than what the public booking page already shows
  -- (worker names/photos are listed there by design).
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
