-- Client identification was two fixed columns (dni, ruc) whose labels were
-- rigidly tied to the business's own country - but a client can have a
-- different kind of document than what the business's country would
-- suggest (a foreign client's passport, a US business with a Peruvian
-- corporate client's RUC, etc.). Replaced with one flexible pair: a type
-- picker + a single number, so the person entering the client decides.

alter table public.clients
  add column if not exists document_type text check (document_type in ('dni', 'ruc', 'ein', 'passport', 'other'));

alter table public.clients
  add column if not exists document_number text;

-- Best-effort migration of existing data. If both dni and ruc happen to be
-- filled on the same row, ruc wins (it's the more specific business-level
-- document) and the dni value is dropped - an acceptable loss for the
-- handful of pre-launch test rows this affects.
update public.clients
set document_type = 'ruc', document_number = ruc
where ruc is not null and trim(ruc) <> '';

update public.clients
set document_type = 'dni', document_number = dni
where document_number is null and dni is not null and trim(dni) <> '';

alter table public.clients drop column if exists dni;
alter table public.clients drop column if exists ruc;
