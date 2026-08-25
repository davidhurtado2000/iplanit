-- Client birthday emails (configurable per business: enabled, discount %,
-- and send window). Month/day only, deliberately no year - the email
-- doesn't need the client's age, and storing less sensitive data than
-- necessary by default is better.

alter table public.clients
  add column if not exists birthday_month smallint check (birthday_month between 1 and 12),
  add column if not exists birthday_day smallint check (birthday_day between 1 and 31),
  -- Tracks "already emailed this year" so the daily cron doesn't resend
  -- every day across a whole 'week'/'month' window - simpler than computing
  -- the exact first day of that window, and survives a missed cron run.
  add column if not exists last_birthday_email_sent_year smallint;

alter table public.businesses
  add column if not exists birthday_emails_enabled boolean not null default false,
  add column if not exists birthday_discount_percent smallint check (birthday_discount_percent between 0 and 100),
  add column if not exists birthday_window text not null default 'day' check (birthday_window in ('day', 'week', 'month'));

-- Same pattern as get_reservations_needing_reminders() (scripts/041) - the
-- cron has no logged-in user, so this can't rely on RLS like everything
-- else. security definer lets it see across every business/client
-- regardless, gated below to service_role only.
--
-- A client's birthday is normalized onto the CURRENT year (make_date with
-- extract(year from now())), with Feb 29 falling back to Feb 28 in a
-- non-leap year. The window is checked against both this year's and next
-- year's occurrence of that date so a birthday in late December still
-- matches a 'week'/'month' window that has already rolled into January.
create or replace function public.get_clients_needing_birthday_email()
returns table (
  client_id uuid,
  client_email text,
  client_name text,
  business_id uuid,
  business_name text,
  business_country text,
  discount_percent smallint
)
language sql
security definer
stable
set search_path = public
as $$
  with normalized as (
    select
      c.id as client_id,
      c.email as client_email,
      c.name as client_name,
      c.business_id,
      b.name as business_name,
      b.country as business_country,
      b.birthday_discount_percent as discount_percent,
      b.birthday_window,
      -- make_date rejects Feb 29 in a non-leap year outright, so clamp the
      -- day first rather than letting the function raise.
      make_date(
        extract(year from now())::int,
        c.birthday_month,
        least(
          c.birthday_day,
          extract(day from (make_date(extract(year from now())::int, c.birthday_month, 1) + interval '1 month - 1 day'))::int
        )
      ) as birthday_this_year
    from public.clients c
    join public.businesses b on b.id = c.business_id
    where c.birthday_month is not null
      and c.birthday_day is not null
      and c.email is not null
      and b.birthday_emails_enabled = true
      and (c.last_birthday_email_sent_year is null or c.last_birthday_email_sent_year <> extract(year from now())::int)
  )
  select client_id, client_email, client_name, business_id, business_name, business_country, discount_percent
  from normalized
  where case birthday_window
    when 'day' then now()::date = birthday_this_year
      or now()::date = (birthday_this_year - interval '1 year')::date
      or now()::date = (birthday_this_year + interval '1 year')::date
    when 'week' then now()::date between birthday_this_year - 3 and birthday_this_year + 3
      or now()::date between (birthday_this_year - interval '1 year')::date - 3 and (birthday_this_year - interval '1 year')::date + 3
      or now()::date between (birthday_this_year + interval '1 year')::date - 3 and (birthday_this_year + interval '1 year')::date + 3
    else now()::date between date_trunc('month', birthday_this_year)::date and (date_trunc('month', birthday_this_year) + interval '1 month - 1 day')::date
      or now()::date between date_trunc('month', (birthday_this_year - interval '1 year'))::date and (date_trunc('month', (birthday_this_year - interval '1 year')) + interval '1 month - 1 day')::date
      or now()::date between date_trunc('month', (birthday_this_year + interval '1 year'))::date and (date_trunc('month', (birthday_this_year + interval '1 year')) + interval '1 month - 1 day')::date
  end;
$$;

revoke all on function public.get_clients_needing_birthday_email() from public;
grant execute on function public.get_clients_needing_birthday_email() to service_role;
