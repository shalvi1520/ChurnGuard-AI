import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// ============================================
// ChurnGuard – Contextual navigation
// ============================================
//
// The Monitor → Retention workflow (Portfolio & Risk → Customers → Customer →
// Explainability / Recommendations / Outreach) is walked by drilling down and
// coming back, not by returning to the sidebar each time. Two rules keep that
// predictable:
//
// 1. Drilling down is a normal push that records where the user was, in router
//    location state: `from` ({ path, label }) is the page they just left, and
//    `customersPath` is the (possibly filtered) Customers list the task started
//    from. Location state belongs to the history entry, so it survives a
//    refresh and Back/Forward -- and never leaks into a link someone shares.
// 2. Returning to exactly that `from` entry steps back through history instead
//    of pushing a duplicate. The in-page "Back to …" and the browser's Back
//    button then do the same thing, and Forward keeps working.
//
// Never forward another page's `from` onward: rule 2 relies on `from` being
// the entry immediately before this one.

/** `/customers` with the given filters as query parameters (empty ones dropped). */
export function customersHref(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') params.set(key, value);
  });
  const qs = params.toString();
  return qs ? `/customers?${qs}` : '/customers';
}

/** A Retention page opened for one account. */
export function withCustomer(path, customerId) {
  return `${path}?customer=${encodeURIComponent(customerId)}`;
}

export function useWorkflowNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const here = location.pathname + location.search;
  const from = location.state?.from ?? null;
  const customersPath = location.pathname === '/customers' ? here : location.state?.customersPath ?? null;

  /** Location state for a drill-down away from this page; `label` names this
   *  page in the destination's "Back to …". */
  const stateFrom = useCallback(
    (label) => ({ from: { path: here, label }, customersPath }),
    [here, customersPath]
  );

  const drill = useCallback((to, label) => navigate(to, { state: stateFrom(label) }), [navigate, stateFrom]);

  const goBackTo = useCallback(
    (to) => {
      if (from?.path === to) navigate(-1);
      else navigate(to);
    },
    [from, navigate]
  );

  return { from, customersPath, stateFrom, drill, goBackTo };
}
