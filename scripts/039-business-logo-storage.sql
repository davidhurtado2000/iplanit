-- Business logo upload: businesses.logo_url has existed since script 002
-- and the public booking page already displays it if set, but there was no
-- storage bucket or upload UI behind it - same gap script 015 fixed for
-- personal avatars, mirrored here for the business logo.
--
-- Files are stored as {business_id}/logo.{ext} (one per business,
-- overwritten on re-upload). Unlike avatars (where the folder is the
-- uploader's own auth.uid()), the folder here is the business id, so write
-- access is scoped by checking ownership against public.businesses instead
-- of a direct auth.uid() match - only the owner can change their business's
-- logo, matching the existing owner-only gate on Settings > Negocio.

insert into storage.buckets (id, name, public)
values ('business-logos', 'business-logos', true)
on conflict (id) do nothing;

drop policy if exists "Business logos are publicly accessible" on storage.objects;
create policy "Business logos are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'business-logos');

drop policy if exists "Owners can upload their business logo" on storage.objects;
create policy "Owners can upload their business logo"
  on storage.objects for insert
  with check (
    bucket_id = 'business-logos'
    and (storage.foldername(name))[1] in (
      select id::text from public.businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "Owners can update their business logo" on storage.objects;
create policy "Owners can update their business logo"
  on storage.objects for update
  using (
    bucket_id = 'business-logos'
    and (storage.foldername(name))[1] in (
      select id::text from public.businesses where owner_id = auth.uid()
    )
  );

drop policy if exists "Owners can delete their business logo" on storage.objects;
create policy "Owners can delete their business logo"
  on storage.objects for delete
  using (
    bucket_id = 'business-logos'
    and (storage.foldername(name))[1] in (
      select id::text from public.businesses where owner_id = auth.uid()
    )
  );
