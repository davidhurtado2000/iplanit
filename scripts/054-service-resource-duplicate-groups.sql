-- Services/resources are deliberately per-sede (no organization_id, unlike
-- clients - scripts/053) - duplicating one into another sede (Servicios/
-- Recursos "Duplicar", with a target-sede picker) creates a genuinely
-- independent row with no link back to where it came from. This adds a
-- lightweight way to say "these rows are the same offering, repeated
-- across sedes" so the UI can show "tambien en Sede X" instead of leaving
-- duplicated offerings looking like unrelated coincidences.
--
-- Group-id strategy, not a parent-pointer chain: every row in a duplicated
-- family shares the SAME duplicate_group_id, generated client-side the
-- first time a row is ever duplicated and written onto both the source and
-- the new row. This makes "find every relative" a single flat query
-- (where duplicate_group_id = X) regardless of how many sedes are
-- involved or which row was duplicated from which - no recursion needed.
-- Null for the vast majority of rows that were never duplicated.

alter table public.services add column if not exists duplicate_group_id uuid;
alter table public.resources add column if not exists duplicate_group_id uuid;

create index if not exists services_duplicate_group_id_idx
  on public.services(duplicate_group_id) where duplicate_group_id is not null;
create index if not exists resources_duplicate_group_id_idx
  on public.resources(duplicate_group_id) where duplicate_group_id is not null;

-- No RLS changes needed: an owner already passes is_business_accessible()
-- (scripts/024/052) on every sede they own, so a cross-sede "who else
-- shares this group_id" query already works today the same way the
-- expandable calendar's org-wide fetch already reads services/resources
-- across every sede in the org.
