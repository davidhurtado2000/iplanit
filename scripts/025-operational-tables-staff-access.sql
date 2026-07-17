-- Grants staff (added via add_business_staff, see script 024) the same
-- read/write access the owner already has on the operational, day-to-day
-- tables. Configuracion-type tables (businesses, business_hours) are
-- intentionally NOT touched here beyond read access - see script 026.

-- services
drop policy if exists "Users can view services of their business" on public.services;
create policy "Users can view services of their business"
  on public.services for select
  using (public.is_business_accessible(business_id));

drop policy if exists "Users can insert services to their business" on public.services;
create policy "Users can insert services to their business"
  on public.services for insert
  with check (public.is_business_accessible(business_id));

drop policy if exists "Users can update services of their business" on public.services;
create policy "Users can update services of their business"
  on public.services for update
  using (public.is_business_accessible(business_id));

drop policy if exists "Users can delete services of their business" on public.services;
create policy "Users can delete services of their business"
  on public.services for delete
  using (public.is_business_accessible(business_id));

-- resources
drop policy if exists "Users can view resources of their business" on public.resources;
create policy "Users can view resources of their business"
  on public.resources for select
  using (public.is_business_accessible(business_id));

drop policy if exists "Users can insert resources to their business" on public.resources;
create policy "Users can insert resources to their business"
  on public.resources for insert
  with check (public.is_business_accessible(business_id));

drop policy if exists "Users can update resources of their business" on public.resources;
create policy "Users can update resources of their business"
  on public.resources for update
  using (public.is_business_accessible(business_id));

drop policy if exists "Users can delete resources of their business" on public.resources;
create policy "Users can delete resources of their business"
  on public.resources for delete
  using (public.is_business_accessible(business_id));

-- clients
drop policy if exists "Users can view clients of their business" on public.clients;
create policy "Users can view clients of their business"
  on public.clients for select
  using (public.is_business_accessible(business_id));

drop policy if exists "Users can insert clients to their business" on public.clients;
create policy "Users can insert clients to their business"
  on public.clients for insert
  with check (public.is_business_accessible(business_id));

drop policy if exists "Users can update clients of their business" on public.clients;
create policy "Users can update clients of their business"
  on public.clients for update
  using (public.is_business_accessible(business_id));

drop policy if exists "Users can delete clients of their business" on public.clients;
create policy "Users can delete clients of their business"
  on public.clients for delete
  using (public.is_business_accessible(business_id));

-- reservations
drop policy if exists "Users can view reservations of their business" on public.reservations;
create policy "Users can view reservations of their business"
  on public.reservations for select
  using (public.is_business_accessible(business_id));

drop policy if exists "Users can insert reservations to their business" on public.reservations;
create policy "Users can insert reservations to their business"
  on public.reservations for insert
  with check (public.is_business_accessible(business_id));

drop policy if exists "Users can update reservations of their business" on public.reservations;
create policy "Users can update reservations of their business"
  on public.reservations for update
  using (public.is_business_accessible(business_id));

drop policy if exists "Users can delete reservations of their business" on public.reservations;
create policy "Users can delete reservations of their business"
  on public.reservations for delete
  using (public.is_business_accessible(business_id));

-- reservation_series
drop policy if exists "Users can view series of their business" on public.reservation_series;
create policy "Users can view series of their business"
  on public.reservation_series for select
  using (public.is_business_accessible(business_id));

drop policy if exists "Users can insert series to their business" on public.reservation_series;
create policy "Users can insert series to their business"
  on public.reservation_series for insert
  with check (public.is_business_accessible(business_id));

drop policy if exists "Users can update series of their business" on public.reservation_series;
create policy "Users can update series of their business"
  on public.reservation_series for update
  using (public.is_business_accessible(business_id));

drop policy if exists "Users can delete series of their business" on public.reservation_series;
create policy "Users can delete series of their business"
  on public.reservation_series for delete
  using (public.is_business_accessible(business_id));

-- service_resources (originally a single FOR ALL policy)
drop policy if exists "Business owners can manage service_resources" on public.service_resources;
create policy "Business members can manage service_resources"
  on public.service_resources for all
  using (public.is_business_accessible(business_id))
  with check (public.is_business_accessible(business_id));
