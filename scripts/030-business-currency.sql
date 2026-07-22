-- Service pricing was tied directly to businesses.country (PE -> Soles,
-- US -> Dollars), but a business's billing currency isn't always the same
-- as its country - a Peru-based business might bill international clients
-- in USD, or vice versa. This adds an independent currency setting,
-- defaulted from country for existing rows but editable on its own from
-- here on (see Settings > Negocio).

alter table public.businesses
  add column if not exists currency text;

update public.businesses
  set currency = case when country = 'US' then 'USD' else 'PEN' end
  where currency is null;

alter table public.businesses
  alter column currency set default 'PEN';

alter table public.businesses
  alter column currency set not null;

alter table public.businesses
  drop constraint if exists businesses_currency_check;

alter table public.businesses
  add constraint businesses_currency_check check (currency in ('PEN', 'USD'));
