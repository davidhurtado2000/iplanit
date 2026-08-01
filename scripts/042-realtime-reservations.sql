-- Enables Supabase Realtime (postgres_changes) on reservations, so the
-- dashboard can show a live toast when a new reservation comes in (e.g. via
-- the public booking link) without the staff member needing to refresh.
-- Guarded with an existence check since ALTER PUBLICATION ... ADD TABLE
-- errors if the table is already a publication member (unlike most of this
-- project's "if not exists" DDL, publications don't support that clause
-- directly).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reservations'
  ) then
    alter publication supabase_realtime add table public.reservations;
  end if;
end $$;
