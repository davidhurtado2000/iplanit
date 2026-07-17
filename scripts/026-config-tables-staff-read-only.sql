-- Staff can READ business info and business hours (needed to operate the
-- calendar/settings-derived logic like business-hours validation), but
-- cannot write to either - only the owner-only insert/update/delete
-- policies created in scripts 002 and 007 remain in effect for writes.

drop policy if exists "Users can view their own business" on public.businesses;
create policy "Users can view their own business"
  on public.businesses for select
  using (public.is_business_accessible(id));

drop policy if exists "Users can view business hours of their business" on public.business_hours;
create policy "Users can view business hours of their business"
  on public.business_hours for select
  using (public.is_business_accessible(business_id));
