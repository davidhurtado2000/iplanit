-- Rate-limit ledger for the AI-generated Analytics summary
-- (app/api/dashboard/analytics-summary/route.ts). Every call costs real
-- money (OpenAI), so this needs the same abuse-defense shape as
-- notification_send_log (scripts/063) - a purpose-built table the route
-- writes to with a service-role client, RLS locked to service_role only, no
-- policy for authenticated/anon so nothing else can insert or read it.

create table if not exists public.ai_summary_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists ai_summary_log_lookup_idx
  on public.ai_summary_log(business_id, created_at);

alter table public.ai_summary_log enable row level security;

create policy "Service role can manage ai summary log"
  on public.ai_summary_log for all
  using (auth.role() = 'service_role');
