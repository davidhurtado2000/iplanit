import type { Translations } from '@/context/language-context'

/**
 * Per-business override for "Trabajador"/"Trabajadores" (scripts/058-
 * worker-label-customization.sql) - so a business can call their team
 * "Profesores", "Doctores", "Barberos", etc. instead of the generic
 * default. Deliberately applied only at plain-noun spots (nav item, page
 * titles, table headers) rather than every single "Trabajador" string in
 * the app: Spanish adjective/article agreement ("Nuevo trabajador" vs
 * "Nueva recepcionista") can't be resolved from a free-text label alone, so
 * copy that needs an adjective next to the noun stays worded to avoid
 * requiring one (e.g. "Agregar {label}", not "Nuevo/a {label}").
 */
export function getWorkerLabel(
  business: { worker_label_singular?: string | null; worker_label_plural?: string | null } | null | undefined,
  t: Translations
): { singular: string; plural: string } {
  return {
    singular: business?.worker_label_singular?.trim() || t.workers.singularDefault,
    plural: business?.worker_label_plural?.trim() || t.workers.title,
  }
}
