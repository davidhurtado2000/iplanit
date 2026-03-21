-- Create services table
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  duration_minutes integer not null default 30,
  price numeric(10, 2) not null default 0,
  color text default '#3B82F6',
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.services enable row level security;

-- RLS Policies for services
drop policy if exists "Users can view services of their business" on public.services;
create policy "Users can view services of their business"
  on public.services for select
  using (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "Users can insert services to their business" on public.services;
create policy "Users can insert services to their business"
  on public.services for insert
  with check (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "Users can update services of their business" on public.services;
create policy "Users can update services of their business"
  on public.services for update
  using (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "Users can delete services of their business" on public.services;
create policy "Users can delete services of their business"
  on public.services for delete
  using (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "Service role can manage services" on public.services;
create policy "Service role can manage services"
  on public.services for all
  using (auth.role() = 'service_role');

-- Create indexes
create index if not exists services_business_id_idx on public.services(business_id);
