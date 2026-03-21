-- Create business_hours table
create table if not exists public.business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  open_time time not null,
  close_time time not null,
  is_closed boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(business_id, day_of_week)
);

-- Enable RLS
alter table public.business_hours enable row level security;

-- RLS Policies for business_hours
drop policy if exists "Users can view business hours of their business" on public.business_hours;
create policy "Users can view business hours of their business"
  on public.business_hours for select
  using (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "Users can insert business hours to their business" on public.business_hours;
create policy "Users can insert business hours to their business"
  on public.business_hours for insert
  with check (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "Users can update business hours of their business" on public.business_hours;
create policy "Users can update business hours of their business"
  on public.business_hours for update
  using (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "Users can delete business hours of their business" on public.business_hours;
create policy "Users can delete business hours of their business"
  on public.business_hours for delete
  using (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "Service role can manage business hours" on public.business_hours;
create policy "Service role can manage business hours"
  on public.business_hours for all
  using (auth.role() = 'service_role');

-- Create indexes
create index if not exists business_hours_business_id_idx on public.business_hours(business_id);
