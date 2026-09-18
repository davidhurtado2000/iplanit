-- Pricing overhaul, Phase 4: moves plan+card selection into the signup
-- flow itself (new /onboarding/plan page), instead of leaving a business
-- on the frozen ('free') tier indefinitely until someone happens to visit
-- Settings > Plan.
--
-- requires_plan_selection is how the dashboard layout (app/(dashboard)/
-- layout.tsx) decides whether to redirect an owner to /onboarding/plan
-- before letting them see any dashboard page. Defaults true so every
-- NEW signup from now on gets routed through it - but every EXISTING
-- account is explicitly backfilled to false below, so this ships without
-- touching a single current customer's experience. What happens to
-- existing Free/frozen accounts is Phase 5, a deliberately separate,
-- not-yet-decided rollout (advance notice + grace period, per David) -
-- this column exists now so Phase 5 has a real flag to flip later
-- (UPDATE profiles SET requires_plan_selection = true WHERE ...) instead
-- of needing its own migration then.
alter table public.profiles
  add column if not exists requires_plan_selection boolean not null default true;

update public.profiles set requires_plan_selection = false where requires_plan_selection = true;
