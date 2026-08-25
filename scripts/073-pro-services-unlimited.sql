-- Pro plan: services becomes unlimited (same pattern as reservations/clients,
-- already unlimited on Pro) - resources stays capped at 5, unchanged.
-- check_resource_limit() is intentionally NOT touched.

create or replace function public.check_service_limit()
returns trigger as $$
declare
  v_plan text;
  v_limit int;
  v_count int;
begin
  v_plan := public.get_business_plan(new.business_id);

  if v_plan in ('pro', 'premium') then
    return new;
  end if;

  v_limit := 3;

  select count(*) into v_count from public.services where business_id = new.business_id;

  if v_count >= v_limit then
    raise exception 'free_plan_service_limit' using errcode = 'PLN03';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;
