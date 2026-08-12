-- Lets each business rename "Trabajador/Trabajadores" to whatever fits
-- their industry (Profesor, Doctor, Barbero, Recepcionista, etc.) across
-- the handful of highest-visibility spots in the UI (nav item, Workers
-- page header/button, reservation form's worker picker, analytics
-- breakdown title). Purely a display label - the underlying `workers`
-- table/relationships are unaffected. Nullable with no default: null means
-- "use the built-in Trabajador/Trabajadores wording", same as every other
-- optional business field (see e.g. tax_id, logo_url).
alter table public.businesses
  add column if not exists worker_label_singular text,
  add column if not exists worker_label_plural text;
