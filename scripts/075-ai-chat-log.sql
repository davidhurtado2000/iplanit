-- Rate-limit ledger for the AI business-data chat
-- (app/api/dashboard/ai-chat/route.ts). Same shape and reasoning as
-- ai_summary_log (scripts/074) - every message costs real money (OpenAI),
-- and can trigger several tool-call round trips per message, so this has
-- its own (higher) cap than the one-shot summary feature.

create table if not exists public.ai_chat_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists ai_chat_log_lookup_idx
  on public.ai_chat_log(business_id, created_at);

alter table public.ai_chat_log enable row level security;

create policy "Service role can manage ai chat log"
  on public.ai_chat_log for all
  using (auth.role() = 'service_role');
