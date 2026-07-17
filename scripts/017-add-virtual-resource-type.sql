-- Adds "virtual" (Zoom, Google Meet, etc.) as a fourth resource type
-- alongside room/person/equipment. Postgres auto-names an unnamed inline
-- check constraint as "{table}_{column}_check", which is what
-- 004-create-resources.sql relied on.

alter table public.resources
  drop constraint if exists resources_type_check;

alter table public.resources
  add constraint resources_type_check
  check (type in ('room', 'person', 'equipment', 'virtual'));
