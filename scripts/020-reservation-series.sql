-- Recurring 1:1 sessions (e.g. a weekly therapy/coaching client) grouped so
-- the remaining batch can be cancelled together. Each occurrence is still a
-- normal row in `reservations` - series_id just tags which ones belong
-- together, so everything already built (status workflow, the overlap
-- exclusion constraint, analytics, client history) keeps working unmodified.

create table if not exists public.reservation_series (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  resource_id uuid references public.resources(id) on delete set null,
  -- 0 = Sunday .. 6 = Saturday, matching JS Date#getDay()
  days_of_week int[] not null,
  session_count int not null check (session_count > 0),
  notes text,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.reservations
  add column if not exists series_id uuid references public.reservation_series(id) on delete set null;

create index if not exists reservations_series_id_idx on public.reservations(series_id);

alter table public.reservation_series enable row level security;

drop policy if exists "Users can view series of their business" on public.reservation_series;
create policy "Users can view series of their business"
  on public.reservation_series for select
  using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

drop policy if exists "Users can insert series to their business" on public.reservation_series;
create policy "Users can insert series to their business"
  on public.reservation_series for insert
  with check (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

drop policy if exists "Users can update series of their business" on public.reservation_series;
create policy "Users can update series of their business"
  on public.reservation_series for update
  using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

drop policy if exists "Users can delete series of their business" on public.reservation_series;
create policy "Users can delete series of their business"
  on public.reservation_series for delete
  using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

drop policy if exists "Service role can manage series" on public.reservation_series;
create policy "Service role can manage series"
  on public.reservation_series for all
  using (auth.role() = 'service_role');
