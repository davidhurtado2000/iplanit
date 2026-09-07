-- Fixes a real bug: staff invited into someone else's Pro/Premium business
-- could never use the AI add-on, because every access check
-- (app/api/dashboard/ai-chat, analytics-summary, and the whole client-side
-- chain rooted in context/auth-context.tsx) read plan/ai_addon_* off the
-- CALLING user's own profile instead of the business owner's. A staff
-- member has their own separate profiles row (their own signup, plan
-- defaults to 'free', never personally bought the add-on) - so they were
-- denied even when the business itself was Premium with AI active, or Pro
-- with the add-on active.
--
-- get_business_plan() (scripts/052-three-tier-plans.sql) already proved the
-- correct fix for the `plan` field alone: resolve through
-- businesses.owner_id, not auth.uid(). This just extends that same join to
-- also cover ai_addon_active/ai_addon_override/ai_addon_access_until.

-- Lean version for the two hot-path server routes (ai-chat, analytics-
-- summary) - no usage counts, since this runs on every chat message / every
-- analytics summary request and both already do their own is_business_paid/
-- meetsPlan checks around it.
create or replace function public.get_business_ai_addon_status(p_business_id uuid)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select case
    when not public.is_business_accessible(p_business_id) then json_build_object('error', 'not_accessible')
    else (
      select json_build_object(
        'plan', p.plan,
        'ai_addon_active', p.ai_addon_active,
        'ai_addon_override', p.ai_addon_override,
        'ai_addon_access_until', p.ai_addon_access_until
      )
      from public.businesses b
      join public.profiles p on p.id = b.owner_id
      where b.id = p_business_id
    )
  end;
$$;

-- get_plan_usage: the dashboard UI (Settings, sidebar, plan-usage-banner)
-- already fetches this per-business RPC - widen it to also resolve
-- ai_addon_* through the owner, same join as above, so those callers stop
-- needing a second round-trip and stop reading the wrong profile too.
create or replace function public.get_plan_usage(p_business_id uuid)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_owner record;
begin
  if not public.is_business_accessible(p_business_id) then
    return json_build_object('error', 'not_accessible');
  end if;

  select organization_id into v_organization_id from public.businesses where id = p_business_id;

  select p.plan, p.ai_addon_active, p.ai_addon_override, p.ai_addon_access_until
    into v_owner
    from public.businesses b
    join public.profiles p on p.id = b.owner_id
    where b.id = p_business_id;

  return json_build_object(
    'plan', v_owner.plan,
    'ai_addon_active', v_owner.ai_addon_active,
    'ai_addon_override', v_owner.ai_addon_override,
    'ai_addon_access_until', v_owner.ai_addon_access_until,
    'reservations_this_month', (
      select count(*) from public.reservations
      where business_id = p_business_id and created_at >= date_trunc('month', now())
    ),
    'clients', (select count(*) from public.clients where organization_id = v_organization_id),
    'services', (select count(*) from public.services where business_id = p_business_id),
    'resources', (
      select count(*) from public.resources
      where business_id = p_business_id and type <> 'parking'
    ),
    'team_seats', (select count(*) from public.business_members where business_id = p_business_id)
  );
end;
$$;
