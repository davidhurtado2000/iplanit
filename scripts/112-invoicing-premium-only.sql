-- Electronic invoicing becomes a Premium-only feature (decision of
-- 2026-11-06 with the co-founder). Run after scripts/111.
--
--   - Basic and Pro no longer have invoicing at all (no add-on to buy).
--     Removing their rows from invoicing_plan_config is enough:
--     business_has_invoicing_access() needs a config row for the plan.
--   - Premium ($45/month, was $40 + $5 add-on) includes it with no add-on:
--     1,000 comprobantes/month, overage stays at $10 per 500.
--   - An "Enterprise" tier (2,000 comprobantes) is a future idea, not built.
--
-- billing_exempt accounts still resolve to 'premium' in get_business_plan(),
-- so they keep access.

delete from public.invoicing_plan_config where plan in ('basic', 'pro');

insert into public.invoicing_plan_config
  (plan, included_docs, addon_required, addon_price_usd, overage_block_size, overage_block_price_usd)
values ('premium', 1000, false, 0, 500, 10)
on conflict (plan) do update
  set included_docs = excluded.included_docs,
      addon_required = excluded.addon_required,
      addon_price_usd = excluded.addon_price_usd,
      overage_block_size = excluded.overage_block_size,
      overage_block_price_usd = excluded.overage_block_price_usd,
      updated_at = now();
