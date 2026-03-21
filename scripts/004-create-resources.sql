-- Create resources table
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  type text not null check (type in ('room', 'person', 'equipment')),
  description text,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.resources enable row level security;

-- RLS Policies for resources
drop policy if exists "Users can view resources of their business" on public.resources;
create policy "Users can view resources of their business"
  on public.resources for select
  using (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "Users can insert resources to their business" on public.resources;
create policy "Users can insert resources to their business"
  on public.resources for insert
  with check (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "Users can update resources of their business" on public.resources;
create policy "Users can update resources of their business"
  on public.resources for update
  using (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "Users can delete resources of their business" on public.resources;
create policy "Users can delete resources of their business"
  on public.resources for delete
  using (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "Service role can manage resources" on public.resources;
create policy "Service role can manage resources"
  on public.resources for all
  using (auth.role() = 'service_role');

-- Create indexes
create index if not exists resources_business_id_idx on public.resources(business_id);
