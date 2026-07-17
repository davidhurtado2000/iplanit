-- iPlanit now targets businesses in both Peru and the US. `country` already
-- existed on businesses (free text, unused by the app) - this repurposes it
-- as the flag that decides which client ID labels to show (DNI/RUC vs EIN),
-- backfilling existing rows to 'PE' since the app was built Peru-first.

update public.businesses set country = 'PE' where country is null or country not in ('PE', 'US');

alter table public.businesses
  alter column country set default 'PE';

alter table public.businesses
  alter column country set not null;

alter table public.businesses
  drop constraint if exists businesses_country_check;

alter table public.businesses
  add constraint businesses_country_check check (country in ('PE', 'US'));
