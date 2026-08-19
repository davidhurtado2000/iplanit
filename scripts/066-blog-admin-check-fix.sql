-- Fixes app/admin/layout.tsx's authorization check: it needs to ask "am I a
-- platform admin?" via RPC (is_platform_admin(), security definer) instead
-- of querying the platform_admins table directly - that table intentionally
-- has no policy granting authenticated users read access to it (not even to
-- their own row), by design (scripts/065-blog.sql), so the direct query
-- always returned empty regardless of whether the row existed. Calling the
-- function instead needs an explicit execute grant, since it's now invoked
-- directly by client code via supabase.rpc(...) rather than only referenced
-- from inside other RLS policies.

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;
