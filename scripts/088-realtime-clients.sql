-- Enables Supabase Realtime (postgres_changes) on clients, mirroring
-- scripts/042-realtime-reservations.sql. Without this, the Kommo webhook
-- (contacts[add]/contacts[update]) writes new/updated clients straight to
-- the DB with no signal ever reaching an open dashboard tab - staff would
-- need to manually reload to see them. Guarded the same way: ALTER
-- PUBLICATION ... ADD TABLE errors if the table is already a member.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'clients'
  ) then
    alter publication supabase_realtime add table public.clients;
  end if;
end $$;
