-- In-app feedback widget: a floating button on every dashboard page lets
-- any signed-in user send a quick free-text note. Deliberately minimal -
-- no admin UI, no read policy for regular users. Feedback is meant to be
-- read directly from the Supabase SQL editor/table view, not surfaced back
-- into the app - "the data without building anything complex."

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete set null,
  message text not null,
  page_url text,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- Insert-only, and only as yourself - no select/update/delete policy for
-- regular users on purpose, so feedback can't be edited or read back after
-- sending (keeps it an honest one-way note, and there's nothing in the UI
-- that needs to read it back).
drop policy if exists "Users can submit feedback" on public.feedback;
create policy "Users can submit feedback"
  on public.feedback for insert
  with check (user_id = auth.uid());

create index if not exists feedback_created_at_idx on public.feedback(created_at desc);
