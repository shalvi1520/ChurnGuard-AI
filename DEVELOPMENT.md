# Development & Operations Guide

## 1. Configuration

The application is highly configurable through standard mechanisms:

- **Styling Config (`src/index.css`)**: Defines the core design system using CSS variables (`--color-bg-primary`, `--color-accent`, etc.). Tailwind CSS utility classes map to these variables. Modifying these variables will globally alter the application's appearance.
- **Vite Config (`vite.config.js`)**: Standard Vite configuration with the `@vitejs/plugin-react` and `@tailwindcss/vite` plugins.
- **Environment Variables (`.env`)**: 
  - `VITE_USE_MOCK_API`: Setting this to `true` bypasses all external network requests and relies entirely on local mock data. Ideal for UI development, testing, and demos.

## 2. Error Handling and Edge Cases

- **Service Layer Errors**: The `src/services/api.js` layer includes basic error throwing. Currently, errors are largely caught by the calling components and handled silently or via Toast notifications.
- **Global Error Boundary**: The application is wrapped in an `ErrorBoundary` component that catches unhandled runtime exceptions in the component tree, preventing the white screen of death and offering a recovery action.
- **Missing Data**: Components like `CustomersPage` and `RecommendationsPage` utilize an `EmptyState` component to gracefully handle scenarios where arrays are empty.
- **Loading States**: The application heavily relies on Skeleton loaders (`SkeletonCard`, `SkeletonChart`, `SkeletonTable`) to prevent layout shift and provide visual feedback during asynchronous data fetching.
- **Form Validation**: `LoginPage` and `SignupPage` use `react-hook-form` and `zod` schema validation to handle invalid inputs (e.g., malformed emails, short passwords, password mismatch) before attempting authentication.
- **API Failures**: *Known Limitation*: Currently, network failures when `VITE_USE_MOCK_API=false` are caught but not always surfaced comprehensively to the user beyond generic toast messages.

## 3. Testing

*Status: Configured with basic unit tests.*

The repository uses **Vitest** and **React Testing Library**.
- `npm run test`: Runs the test suite once.
- `npm run test:watch`: Runs tests in watch mode.

Basic component tests are implemented in `src/components/ui/` (e.g., `Button.test.jsx`, `Badge.test.jsx`). 

## 4. Security Considerations

- **Authentication**: Currently simulated via `AuthContext`. In a production environment with `VITE_USE_MOCK_API=false`, this must be backed by secure HTTP-only cookies or short-lived JWTs.
- **Authorization**: Role-based access control (RBAC) is not strictly enforced in the UI routing.
- **Input Validation**: Client-side validation is implemented via `Zod` on auth forms. 
- **Secret Management**: No secrets are stored in the frontend repository. Environment variables are strictly for configuration (URLs, feature flags).

## 5. Performance and Scalability

- **Code Splitting**: React Router is configured with `lazy()` and `Suspense`, ensuring that code for complex pages (e.g., Dashboard, Simulator) is only downloaded when the user navigates to them.
- **Rendering Bottlenecks**: The `CustomersPage` renders a table with potentially many rows. While pagination is implemented locally, heavy DOM manipulation could occur if the `limit` is set too high.
- **Chart Performance**: `Recharts` is used, which renders SVGs. Rendering dozens of charts simultaneously (e.g., in a massive grid) could impact performance. The current layout limits charts to a reasonable number per view.

## 6. Known Limitations

- **Mock Data Dependency**: The application is currently heavily reliant on the mock data structures. The real backend API must exactly match the expected JSON schemas defined implicitly by the mock responses.
- **Incomplete Error Handling**: Global error boundary (React Error Boundary) is not implemented. Unhandled exceptions in the render cycle could crash the application.
- **Missing Tests**: No automated tests exist.
- **Local State Pagination**: The CRM table pagination currently operates on the assumption that the mock data returns the total count, but filtering is simulated.

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

**Problem**: The dashboard is empty and infinite loading spinners appear.
**Possible Cause**: `VITE_USE_MOCK_API` is set to `false`, but the backend is not running at `VITE_API_BASE_URL`.
**Solution**: Either start the FastAPI backend server or change `VITE_USE_MOCK_API=true` in the `.env` file to use mock data, then restart the Vite dev server.

**Problem**: Changes to Tailwind classes aren't reflecting in the browser.
**Possible Cause**: The Vite dev server might need a restart, or the class name is dynamically constructed incorrectly (Tailwind cannot purge/compile dynamic class names like `bg-${color}-500`).
**Solution**: Restart `npm run dev`. Ensure you are using the `cn()` utility correctly and not interpolating partial class names.
