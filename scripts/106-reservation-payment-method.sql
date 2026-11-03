-- Record how a client paid, set when staff mark an appointment completed
-- (record-keeping only - nothing is charged; iPlanit doesn't process client
-- payments, see cancellation_fees_deferred). Keys match lib/payment-methods.ts.
-- Country-specific options live in the app; the DB only guarantees a known
-- key so reports never have to deal with free-text spellings.
alter table public.reservations
  add column if not exists payment_method text,
  add column if not exists paid_at timestamptz;

alter table public.reservations
  drop constraint if exists reservations_payment_method_check;
alter table public.reservations
  add constraint reservations_payment_method_check
  check (payment_method is null or payment_method in (
    'cash', 'yape', 'plin', 'visa', 'mastercard', 'amex', 'discover', 'transfer',
    'venmo', 'zelle', 'cashapp', 'apple_pay', 'paypal', 'other'
  ));
