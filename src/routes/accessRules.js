// ============================================
// ChurnGuard – Route access rules
// ============================================
//
// Connecting a dataset is the first required step after signing in. Every other
// authenticated page describes a customer base that doesn't exist yet, so it
// stays locked until setup completes.
//
// Defined once and shared by the route guard (`routes/index.jsx`) and the
// sidebar (`layouts/AppLayout.jsx`), so the navigation can never offer a link
// the guard would immediately bounce.

// `/history` is exempt on purpose: its whole job is to put a previously
// connected dataset back, which is exactly what someone without a connected
// dataset needs. Locking it would hide the shortcut behind the gate it opens.
/** Authenticated paths reachable before a dataset is connected. */
export const SETUP_EXEMPT_PATHS = ['/data-management', '/history', '/settings'];

export function requiresDatasetSetup(path) {
  return !SETUP_EXEMPT_PATHS.includes(path);
}
