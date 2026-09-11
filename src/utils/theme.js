// ============================================
// ChurnGuard – Appearance (theme) preference
// ============================================
//
// ONE definition of the appearance setting, used by every surface that reads
// or writes it: the header control, Settings → Appearance, and the pre-paint
// bootstrap script in index.html. There is deliberately no second theme state
// anywhere — `AppContext` owns the value at runtime and is the only place that
// calls the read/write helpers below.
//
// How it is applied: the resolved theme ('dark' | 'light') is written to
// `<html data-theme="...">`, and `src/index.css` defines the full colour-token
// set for each value. Because the CSS uses an attribute selector rather than
// `:root`, a subtree can opt out (the marketing landing page pins itself to
// dark — its copy is written for a dark background).

export const THEME_STORAGE_KEY = 'churnguard_theme';

/** What the user can choose. `system` follows the OS setting live. */
export const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export const DEFAULT_THEME = 'dark';

const VALID = new Set(THEME_OPTIONS.map((o) => o.value));

export function isThemePreference(value) {
  return VALID.has(value);
}

/** Turns the preference into the theme actually rendered. */
export function resolveTheme(preference, prefersDark) {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  return prefersDark ? 'dark' : 'light';
}

/** True when the OS asks for a dark UI. Safe to call outside a browser. */
export function prefersDarkScheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyResolvedTheme(resolved) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', resolved);
  // Keeps form controls, scrollbars and the like in step with the palette.
  document.documentElement.style.colorScheme = resolved;
}

export function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_THEME;
  } catch {
    // Private mode / storage disabled — the choice just won't persist.
    return DEFAULT_THEME;
  }
}

export function writeStoredTheme(preference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Non-fatal: the in-memory preference still drives this session.
  }
}
