-- Blog + custom CMS (Fase 1 of Estructura-Contenido-Blog-iPlanit.md). This
-- content belongs to iPlanit itself, not to any tenant business, so it
-- needs an access model completely separate from the existing
-- business_id/organization_id-scoped RLS used everywhere else in this
-- schema.

-- ============================================================
-- 1. platform_admins - minimal table, not a hardcoded email. Adding
-- another admin later (e.g. a co-founder) is an insert into this table,
-- not a new migration or a code change.
-- ============================================================

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- Deliberately no select policy for regular users - only service_role and
-- is_platform_admin() (defined below, security definer so it can read this
-- table regardless of RLS) ever need to query it.
create policy "Service role can manage platform admins"
  on public.platform_admins for all
  using (auth.role() = 'service_role');

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  );
$$;

-- ============================================================
-- 2. blog_categories
-- ============================================================

create table if not exists public.blog_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  short_description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.blog_categories enable row level security;

create policy "Anyone can view categories"
  on public.blog_categories for select
  using (true);

create policy "Platform admins can manage categories"
  on public.blog_categories for all
  using (public.is_platform_admin());

insert into public.blog_categories (name, slug, sort_order) values
  ('General', 'general', 0),
  ('Peluquerías y barberías', 'peluquerias-barberias', 1),
  ('Spas y centros de belleza', 'spas-centros-de-belleza', 2),
  ('Clínicas y salud', 'clinicas-salud', 3),
  ('Academias y educación', 'academias-educacion', 4),
  ('Gimnasios y fitness', 'gimnasios-fitness', 5),
  ('Otros negocios de servicios', 'otros-negocios-de-servicios', 6)
on conflict (slug) do nothing;

-- ============================================================
-- 3. blog_articles
-- ============================================================

create table if not exists public.blog_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  category_id uuid not null references public.blog_categories(id),
  meta_title text not null,
  meta_description text not null,
  keyword_principal text,
  keywords_secundarias text[] not null default '{}',
  content text not null default '',
  faq jsonb not null default '[]',
  featured_image_url text,
  featured_image_alt text,
  og_image_url text,
  author text not null default 'Equipo iPlanit',
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  reading_time_minutes int,
  related_articles_override uuid[] not null default '{}',
  functional_tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  -- Sección 3.1 del documento: la imagen destacada es bloqueante para
  -- publicar, no para guardar un borrador.
  constraint blog_articles_published_needs_image check (
    status = 'draft' or (featured_image_url is not null and featured_image_alt is not null)
  )
);

create index if not exists blog_articles_category_id_idx on public.blog_articles(category_id);
create index if not exists blog_articles_status_published_at_idx on public.blog_articles(status, published_at desc);

alter table public.blog_articles enable row level security;

create policy "Anyone can view published articles"
  on public.blog_articles for select
  using (status = 'published' or public.is_platform_admin());

create policy "Platform admins can manage articles"
  on public.blog_articles for all
  using (public.is_platform_admin());

-- ============================================================
-- 4. Storage bucket for featured/inline images - same pattern as
-- business-logos (scripts/039-business-logo-storage.sql): public read,
-- write gated to the relevant owner (here: any platform admin, not a
-- per-business owner_id).
-- ============================================================

insert into storage.buckets (id, name, public)
values ('blog-images', 'blog-images', true)
on conflict (id) do nothing;

create policy "Public read access for blog images"
  on storage.objects for select
  using (bucket_id = 'blog-images');

create policy "Platform admins can upload blog images"
  on storage.objects for insert
  with check (bucket_id = 'blog-images' and public.is_platform_admin());

create policy "Platform admins can update blog images"
  on storage.objects for update
  using (bucket_id = 'blog-images' and public.is_platform_admin());

create policy "Platform admins can delete blog images"
  on storage.objects for delete
  using (bucket_id = 'blog-images' and public.is_platform_admin());

-- ============================================================
-- 5. Seed the first platform admin - David's own login account.
-- ============================================================

insert into public.platform_admins (user_id)
select id from auth.users where email = 'davidsoftwareservicesllc@gmail.com'
on conflict (user_id) do nothing;
