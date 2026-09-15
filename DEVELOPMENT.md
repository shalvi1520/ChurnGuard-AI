# Development & Operations Guide

## 1. Configuration

The application is highly configurable through standard mechanisms:

- **Styling Config (`src/index.css`)**: Defines the core design system using CSS variables (`--color-bg-primary`, `--color-accent`, etc.). Tailwind CSS utility classes map to these variables. Modifying these variables will globally alter the application's appearance.
- **Vite Config (`vite.config.js`)**: Standard Vite configuration with the `@vitejs/plugin-react` and `@tailwindcss/vite` plugins.
- **Environment Variables (`.env`)**:
  - `VITE_API_BASE_URL`: Base URL of the FastAPI + ML backend (`backend/`), default `http://localhost:8000/api`. There is no mock-data mode any more — the app always calls this backend for customers/dashboard/explainability/recommendations/outreach (see "Running the real backend" below). `authService` calls the real backend too, as of session 17 — see "Authentication" below and AUTH_SETUP.md.

### Running the real backend

```
pip install -r backend/requirements.txt
uvicorn backend.api.main:app --reload
```

This starts the FastAPI app on `http://localhost:8000`. It needs a `backend/.env` with at least one LLM provider key (`GROQ_API_KEY`, `GOOGLE_API_KEY`, or `OPENAI_API_KEY`) for the Explainability AI summary and Outreach drafting to work — everything else (training, prediction, SHAP, recommendations) works without one. Then `npm run dev` as usual. CORS defaults to allowing `http://localhost:5173`; override with `CORS_ORIGINS` (comma-separated) in `backend/.env` if serving the frontend elsewhere.

## 2. Error Handling and Edge Cases

- **Service Layer Errors**: The `src/services/api.js` layer includes basic error throwing. Currently, errors are largely caught by the calling components and handled silently or via Toast notifications.
- **Global Error Boundary**: The application is wrapped in an `ErrorBoundary` component that catches unhandled runtime exceptions in the component tree, preventing the white screen of death and offering a recovery action.
- **Missing Data**: Components like `CustomersPage` and `RecommendationsPage` utilize an `EmptyState` component to gracefully handle scenarios where arrays are empty.
- **Loading States**: The application heavily relies on Skeleton loaders (`SkeletonCard`, `SkeletonChart`, `SkeletonTable`) to prevent layout shift and provide visual feedback during asynchronous data fetching.
- **Form Validation**: `LoginPage` and `SignupPage` use `react-hook-form` and `zod` schema validation to handle invalid inputs (e.g., malformed emails, short passwords, password mismatch) before attempting authentication.
- **API Failures**: *Known Limitation*: network failures are caught but not always surfaced comprehensively to the user beyond generic toast messages. (`VITE_USE_MOCK_API` no longer exists — there is no mock-data mode.)

## 3. Testing

*Status: Configured with basic unit tests.*

The repository uses **Vitest** and **React Testing Library**.
- `npm run test`: Runs the test suite once.
- `npm run test:watch`: Runs tests in watch mode.

Basic component tests are implemented in `src/components/ui/` (e.g., `Button.test.jsx`, `Badge.test.jsx`). 

## 4. Security Considerations

- **Authentication**: Real, as of session 17. Passwords are bcrypt-hashed; a session is a row in `user_sessions` addressed by an opaque token in an **HttpOnly** cookie, stored only as its SHA-256. Signing out deletes the row, so it genuinely ends the session rather than discarding a token that stays valid. Google sign-in uses the authorization code flow with OIDC, entirely server-side, with `state`, PKCE and full ID-token verification. See AUTH_SETUP.md.
- **Authorization**: Role-based access control (RBAC) is not strictly enforced in the UI routing.
- **Input Validation**: `Zod` on the auth forms, and the backend independently revalidates everything it is sent (email shape, password length, Terms acceptance) — a client-side check is an affordance, not a control, since the API is reachable directly.
- **Secret Management**: No secrets in the frontend, ever. `VITE_*` variables are inlined into the bundle served to every visitor, so they hold configuration only (the API URL). The database URL, session secret, OAuth client secrets and SMTP credentials all live in `backend/.env`, which is gitignored and never reaches the browser.

## 5. Performance and Scalability

- **Code Splitting**: React Router is configured with `lazy()` and `Suspense`, ensuring that code for complex pages (e.g., Dashboard, Simulator) is only downloaded when the user navigates to them.
- **Rendering Bottlenecks**: The `CustomersPage` renders a table with potentially many rows. While pagination is implemented locally, heavy DOM manipulation could occur if the `limit` is set too high.
- **Chart Performance**: `Recharts` is used, which renders SVGs. Rendering dozens of charts simultaneously (e.g., in a massive grid) could impact performance. The current layout limits charts to a reasonable number per view.

## 6. Known Limitations

- **OAuth needs credentials you register.** The Google code path is complete, but it needs an OAuth application registered with Google and its client id/secret placed in `backend/.env` (AUTH_SETUP.md). Until then the button is disabled and says so — it never fakes a sign-in. Likewise password-reset email needs SMTP settings; without them the reset link is logged and the UI states plainly that delivery is not configured.
- **One active dataset at a time.** `backend/api/store.py` holds the active dataset in process memory; restarting the backend clears it. (There *is* a database — Postgres, with SQLite equally supported — but it holds accounts, sessions, and dataset/training history, not the active dataset's rows.)
- **No time-series data.** An uploaded dataset is a single snapshot — churn-trend and revenue-at-risk-over-time charts are honestly empty rather than fabricated (see `PROJECT_MEMORY.md`).
- **Training runs synchronously in the request.** `POST /datasets/{id}/predict` blocks until training + prediction + a SHAP aggregate finish (tens of seconds to a couple of minutes depending on dataset size). No background job/websocket progress streaming exists yet.

## 7. Future Improvements

### High Priority
- **Implement Real API Integration**: Define strict OpenAPI specs and integrate Axios properly with error interceptors and token refresh logic.
- **Expand Test Coverage**: Add more comprehensive integration tests and E2E testing (e.g., with Playwright or Cypress).

### Medium Priority
- **Enhance Table Features**: Add column resizing, column visibility toggles, and advanced multi-column sorting to the Customers table.
- **WebSockets for Real-time Notifications**: Replace the current polling/static notification panel with a real-time WebSocket connection for live risk alerts.

### Low Priority
- **Accessibility (a11y) Audit**: Improve ARIA labels and keyboard navigation across all interactive components (especially custom Selects and Modals).
- **Internationalization (i18n)**: Prepare the app for multiple languages using `react-i18next`.

## 8. Troubleshooting

**Problem**: The dashboard is empty, shows a "couldn't load" error, or data setup never finishes.
**Possible Cause**: The FastAPI backend isn't running at `VITE_API_BASE_URL`, or no dataset has been uploaded and processed yet.
**Solution**: Start the backend (see "Running the real backend" above), confirm `curl http://localhost:8000/docs` responds, then complete Data Management → upload/demo dataset → validate → map → process.

**Problem**: Changes to Tailwind classes aren't reflecting in the browser.
**Possible Cause**: The Vite dev server might need a restart, or the class name is dynamically constructed incorrectly (Tailwind cannot purge/compile dynamic class names like `bg-${color}-500`).
**Solution**: Restart `npm run dev`. Ensure you are using the `cn()` utility correctly and not interpolating partial class names.
