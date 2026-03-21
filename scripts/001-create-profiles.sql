-- Create profiles table (linked to auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  avatar_url text,
  plan text default 'free' check (plan in ('free', 'premium')),
  timezone text default 'America/Lima',
  language text default 'es',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.profiles enable row level security;

-- RLS Policies for profiles
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "Service role can manage profiles" on public.profiles;
create policy "Service role can manage profiles"
  on public.profiles for all
  using (auth.role() = 'service_role');

-- Function to handle new user signup
drop function if exists public.handle_new_user();
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, '');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Drop existing trigger if it exists
drop trigger if exists on_auth_user_created on auth.users;

-- Create trigger for new user signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
