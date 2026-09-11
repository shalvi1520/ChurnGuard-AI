// ============================================
// ChurnGuard – Dataset field schema
// ============================================
//
// The single source of truth for "what ChurnGuard expects in a customer
// dataset" is `shared/churnguardFields.json`, at the repository root.
//
// This module does not define the fields — it imports that file, which the
// backend (`backend/api/schema.py`) reads too. That is deliberate: the field
// list used to be duplicated here and in Python, and a hand-maintained mirror
// is a schema drift waiting to happen. One file, two readers.
//
// Automatic column matching lives on the backend (`backend/api/mapping.py`),
// where the actual column values are available to check a guess against. The
// frontend only renders what the backend decided, so there is exactly one
// matching implementation.

import schema from '../../shared/churnguardFields.json';

export const SCHEMA_VERSION = schema.version;

/** Every field, in display order. Required fields first. */
export const CHURNGUARD_FIELDS = schema.fields;

export const REQUIRED_FIELDS = CHURNGUARD_FIELDS.filter((f) => f.required);
export const OPTIONAL_FIELDS = CHURNGUARD_FIELDS.filter((f) => !f.required);

export function getField(key) {
  return CHURNGUARD_FIELDS.find((f) => f.key === key) || null;
}

export function getFieldLabel(key) {
  return getField(key)?.label || key;
}

/**
 * Lowercases and strips separators so `Monthly_Charges`, `monthly-charges`
 * and `MonthlyCharges` all collapse to `monthlycharges`.
 *
 * Mirrors `normalize_column_name()` in backend/api/schema.py. Used only for
 * cosmetic comparisons in the UI (e.g. highlighting a column the user is
 * about to pick) — never to decide a mapping, which is the backend's job.
 */
export function normalizeColumnName(name) {
  return String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
