-- Bilingual blog support (ES/EN). Each article belongs to exactly one
-- language; a translated pair shares translation_group_id. The default for
-- translation_group_id is a volatile function (gen_random_uuid()), so this
-- ALTER forces a table rewrite that evaluates it once per existing row -
-- every article written so far becomes its own "group of one" in Spanish,
-- with nothing to republish or backfill by hand.

alter table public.blog_articles
  add column if not exists language text not null default 'es' check (language in ('es', 'en')),
  add column if not exists translation_group_id uuid not null default gen_random_uuid();

alter table public.blog_articles
  add constraint blog_articles_group_language_unique unique (translation_group_id, language);

create index if not exists blog_articles_language_status_published_idx
  on public.blog_articles(language, status, published_at desc);

-- Nullable: categories keep one shared taxonomy across both languages
-- (see plan's "alcance" section). The UI falls back to the Spanish name
-- when the English one hasn't been filled in yet.
alter table public.blog_categories
  add column if not exists name_en text,
  add column if not exists short_description_en text;
