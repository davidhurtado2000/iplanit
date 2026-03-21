-- Create reservations table
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  resource_id uuid references public.resources(id) on delete set null,
  start_time timestamp with time zone not null,
  end_time timestamp with time zone not null,
  status text default 'confirmed' check (status in ('confirmed', 'pending', 'cancelled', 'completed')),
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.reservations enable row level security;

-- RLS Policies for reservations
drop policy if exists "Users can view reservations of their business" on public.reservations;
create policy "Users can view reservations of their business"
  on public.reservations for select
  using (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "Users can insert reservations to their business" on public.reservations;
create policy "Users can insert reservations to their business"
  on public.reservations for insert
  with check (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "Users can update reservations of their business" on public.reservations;
create policy "Users can update reservations of their business"
  on public.reservations for update
  using (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "Users can delete reservations of their business" on public.reservations;
create policy "Users can delete reservations of their business"
  on public.reservations for delete
  using (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "Service role can manage reservations" on public.reservations;
create policy "Service role can manage reservations"
  on public.reservations for all
  using (auth.role() = 'service_role');

-- Index for faster queries
create index if not exists reservations_business_id_idx on public.reservations(business_id);
create index if not exists reservations_start_time_idx on public.reservations(start_time);
create index if not exists reservations_resource_id_idx on public.reservations(resource_id);
create index if not exists reservations_client_id_idx on public.reservations(client_id);
