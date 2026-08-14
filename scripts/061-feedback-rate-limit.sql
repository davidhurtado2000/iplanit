-- Bounds the worst case now that feedback submissions trigger a real-time
-- email (see app/api/webhooks/feedback + the Supabase Database Webhook
-- configured on this table) - without this, any authenticated free account
-- could script unlimited inserts against scripts/038-feedback.sql's
-- insert-only policy and burn through the Resend sending quota. Caps the
-- table itself, not just the notification path.

alter table public.feedback
  add constraint feedback_message_length check (char_length(message) <= 2000);

drop policy if exists "Users can submit feedback" on public.feedback;
create policy "Users can submit feedback"
  on public.feedback for insert
  with check (
    user_id = auth.uid()
    and (
      select count(*) from public.feedback
      where user_id = auth.uid() and created_at > now() - interval '1 hour'
    ) < 10
  );
