-- Create businesses table
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  slug text unique,
  description text,
  timezone text default 'America/Lima',
  phone text,
  email text,
  website text,
  address text,
  city text,
  country text,
  logo_url text,
  plan text default 'free' check (plan in ('free', 'premium')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.businesses enable row level security;

-- RLS Policies for businesses
drop policy if exists "Users can view their own business" on public.businesses;
create policy "Users can view their own business"
  on public.businesses for select
  using (auth.uid() = owner_id);

drop policy if exists "Users can update their own business" on public.businesses;
create policy "Users can update their own business"
  on public.businesses for update
  using (auth.uid() = owner_id);

drop policy if exists "Users can insert their own business" on public.businesses;
create policy "Users can insert their own business"
  on public.businesses for insert
  with check (auth.uid() = owner_id);

drop policy if exists "Users can delete their own business" on public.businesses;
create policy "Users can delete their own business"
  on public.businesses for delete
  using (auth.uid() = owner_id);

drop policy if exists "Service role can manage businesses" on public.businesses;
create policy "Service role can manage businesses"
  on public.businesses for all
  using (auth.role() = 'service_role');

-- Create indexes
create index if not exists businesses_owner_id_idx on public.businesses(owner_id);
create index if not exists businesses_slug_idx on public.businesses(slug);
