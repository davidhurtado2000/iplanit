-- Create clients table
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  notes text,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.clients enable row level security;

-- RLS Policies for clients
drop policy if exists "Users can view clients of their business" on public.clients;
create policy "Users can view clients of their business"
  on public.clients for select
  using (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "Users can insert clients to their business" on public.clients;
create policy "Users can insert clients to their business"
  on public.clients for insert
  with check (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "Users can update clients of their business" on public.clients;
create policy "Users can update clients of their business"
  on public.clients for update
  using (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "Users can delete clients of their business" on public.clients;
create policy "Users can delete clients of their business"
  on public.clients for delete
  using (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "Service role can manage clients" on public.clients;
create policy "Service role can manage clients"
  on public.clients for all
  using (auth.role() = 'service_role');

-- Create indexes
create index if not exists clients_business_id_idx on public.clients(business_id);
