# PROJECT_MEMORY.md — ChurnGuard Frontend

**Read this file AND `claude.md` before starting any new work on this project.**
This file is the persistent memory for coding agents. Update it after every meaningful change: what changed, which files, why, what's now working, what remains.

---

# Project Overview

ChurnGuard is a frontend prototype for an AI-powered customer retention intelligence platform for SaaS Customer Success teams. It is a capstone project (Manipal University Jaipur / Deloitte-style capstone — see the green Deloitte-esque accent color and "Deloitte Capstone 2026" badge on the landing page, which is deliberate branding for this project, not an actual Deloitte product).

This repo (`PRT 1`) was created by copying a mature, mostly-complete existing implementation from a sibling folder (`C:\Users\Admin\Desktop\Antigravity_workspace`) per explicit user instruction, then extending it. That source folder is now considered historical — **all future work happens in this repo (`PRT 1`)**, not in `Antigravity_workspace`.

Reference documents that informed this build (not copied into the repo, live on Desktop):
- `Desktop/Deloitte Capstone/user_flow_diagram.md` — the original user flow (Landing → Login/Signup → Onboarding → Data Management → Dashboard → Customers → Customer Detail → Explainability → Recommendations → Outreach; Simulator and AI Assistant as side branches). **The two side branches were deliberately removed in session 5** — treat that part of the doc as historical.
- `Desktop/Deloitte Capstone/ChurnGuard_AI-Powered_Customer_Retention_Intelligence-*.pptx/.pdf` — capstone presentation (contains OUTDATED XGBoost references — do not use).
- `Desktop/Sifa/ChurnGuard_Master_Specification.docx`, `ChurnGuard_Product_Bible.pdf`, `ChurnGuard_Detailed_User_Journey_PRD.pdf` — product spec docs.
- `Desktop/Deloitte Capstone/Telco_customer_churn.xlsx` — the reference dataset (Telco churn, 7043 rows, 21 columns) that all mock data is modeled after.

# Product Goal

PREDICT → EXPLAIN → ACT. Help Customer Success teams: identify at-risk customers, understand *why* (SHAP-style explanation), decide what to do (recommended action), review an AI-drafted outreach email (human-approved, never auto-sent), and track outcomes. Risk Analytics covers aggregate retention performance; Executive View is the presentation-mode summary.

This is a **prototype**, not a production ML system. Predictions, SHAP values and risk scores are realistic **mock/demo data** unless a real FastAPI backend is connected, and the UI says so wherever they appear. The one thing genuinely computed from real input is the dataset-setup flow's file analysis — row/column counts, missing values, duplicates and churn-label counts are measured from the file the user actually uploads.

# Current Architecture (ML pipeline — conceptual, NOT implemented in this frontend)

```
Telco Dataset → Cleaning → Leakage Removal → Scaling → PSO/ACO Feature Selection
  → TabNet → SHAP → Stacking Ensemble (LightGBM + CatBoost + Random Forest + Logistic Regression)
  → FastAPI → This Dashboard (Next.js/React SPA)
```

**⚠️ NO XGBOOST — CONSTRAINT, NOT A SUGGESTION.** The source presentation (`.pptx`) contains outdated XGBoost references from an earlier project iteration. XGBoost must never appear in code, mock data, UI copy, comments, or docs in this repo. Verified clean as of 2026-09-06, session 5 (`grep -rniE xgboost` across `src/`, `backend/`, root `.md` files, `package.json`, `index.html`, `vite.config.js` → zero matches; the only hits repo-wide are the prohibitions in this file itself). Re-run this grep after large additions.

This pipeline is visualized (conceptually, with a disclaimer that it's not actually running) via the `ModelArchitecture` component — see Components below. It is NOT implemented as actual ML code anywhere in this repo; this is a frontend-only prototype.

Note: the original spec references "Next.js Dashboard" as the frontend layer. The actual implementation is a **Vite + React SPA** (not Next.js) — this was already the case in the inherited `Antigravity_workspace` codebase and was kept rather than rewritten (per "don't perform large refactors without justification" / "preserve existing functionality"). Treat "Next.js" in any spec doc as referring to this React SPA's role in the architecture, not a literal framework requirement.

# Technology Stack

- **React 19 + Vite 8** (SPA, client-side routing via `react-router-dom` v7, `createBrowserRouter`)
- **Tailwind CSS v4** (via `@tailwindcss/vite` plugin, CSS-variable-based theme in `src/index.css` using `@theme {}`)
- **Framer Motion** for animation, **Recharts** for charts, **Lucide React** for icons
- **React Hook Form + Zod** for form validation
- **React Context API** for global state (`AuthContext`, `AppContext`) — no Redux/Zustand
- **Axios** for the (currently unused-in-mock-mode) real-backend HTTP client
- **Vitest + React Testing Library** for unit tests
- **Express + dotenv** — a minimal Node server (`server.js`) that proxies the floating AI assistant's requests to the Grok/xAI API. Optional; the app runs fine without it (the assistant falls back to demo replies).
- **`@react-three/fiber` + `three`** (in use since 2026-09-03) — the landing hero's decorative node-field background (`Hero3DBackground.jsx`). `@react-three/drei` is installed but **not used** — it was tried for the connecting lines (`<Line>`) and dropped in favor of a plain `lineSegments`/`BufferGeometry` (drei didn't meaningfully reduce bundle size and added an extra dependency for one helper). Leave `drei` installed only if something else starts using it; otherwise it's safe to remove.
- **`xlsx` (SheetJS)** — now genuinely used, for XLSX/XLS dataset uploads. Loaded with a dynamic `import()` from `utils/spreadsheet.js` so CSV uploads and every other page never pay for the ~430KB chunk. **It carries a high-severity advisory with no fix on npm** — see Known Issues #4 before touching it.

# Folder Structure

```
PRT 1/
├── server.js                  # Grok/xAI proxy for the AI assistant widget (optional)
├── .env / .env.example        # Vite + server env vars (see below)
├── vite.config.js             # Vite config + dev proxy for /api/assistant → server.js
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── ui/                # Design system: Button, Card, Input, Select, Badge, Modal, Tabs,
│   │   │                      # Avatar, Skeleton, EmptyState, Toast, Pagination, MetricCard,
│   │   │                      # FloatingChatWidget, ErrorBoundary
│   │   ├── data-setup/        # NEW — first-run data onboarding (stepper + 5 step views)
│   │   ├── ModelArchitecture.jsx   # NEW — collapsible ML pipeline visualization
│   │   └── SearchCommand.jsx  # Cmd+K command palette
│   ├── context/                # AuthContext, AppContext (React Context, no external state lib)
│   ├── features/notifications/ # NotificationPanel
│   ├── layouts/                 # AppLayout (sidebar+header shell), AuthLayout
│   ├── mock/                    # ALL mock data lives here — customers, dashboard, explainability,
│   │                             # recommendations, outreach, notifications, users, playbooks (NEW)
│   ├── pages/                   # One file per route (see Pages below)
│   ├── routes/index.jsx         # Single source of truth for routing
│   ├── routes/accessRules.js    # NEW — which paths need a connected dataset
│   ├── services/api.js          # THE service layer — every data access goes through here
│   ├── utils/csv.js             # CSV parsing + dataset profiling (pure functions)
│   ├── utils/spreadsheet.js     # NEW — one reader for CSV / XLSX / XLS
│   ├── utils/glossary.js        # NEW — one definition per metric, shared by every page
│   └── utils/helpers.js         # cn(), formatters, risk color/label helpers, delay()
```

# Pages (routes)

Public: `/` (LandingPage), `/login`, `/signup`, `/forgot-password`.
Protected (behind `ProtectedRoute`, wrapped in `AppLayout` sidebar+header): `/data-management`, `/dashboard`, `/customers`, `/customers/:id`, `/analytics`, `/explainability`, `/recommendations`, `/outreach`, `/settings`, `/executive`.

**Removed 2026-09-06 (session 5):** `/ai-assistant`, `/simulator`, `/playbooks`, `/playbooks/new`. Those routes now fall through to `NotFoundPage`, which is the intended behaviour — they are gone from the product, not broken.

**Note on the AI assistant:** the *feature* came back in session 6, but the *route* did not. It lives only as a global floating widget — see "AI Assistant (floating widget)" below. Do not re-add `/ai-assistant` or a sidebar entry for it.

**Dataset-setup gate (added 2026-09-06).** Every protected route additionally requires `AppContext.datasetSetupComplete`, except the two listed in `src/routes/accessRules.js` (`SETUP_EXEMPT_PATHS` = `/data-management`, `/settings`). Authenticated users without a connected dataset are redirected to `/data-management`. `accessRules.js` is the single definition — `ProtectedRoute` and `AppLayout`'s sidebar both read it, so the nav can never offer a link the guard would bounce.
Protected but **bare** (no sidebar chrome, its own full-screen flow, via `BareProtectedRoute`): `/onboarding` (NEW).
Fallback: `*` → NotFoundPage.

`OnboardingPage.jsx` — 4-step wizard (Company Setup → Customer Information → Retention Goals → Connect Data) shown after signup, before the main app. Both exits ("Continue to data setup" and "Skip for now") lead to `/data-management`. Purely local state, nothing persisted (no backend endpoint exists) — intentional for a prototype.

# AI Assistant (floating widget, session 6)

The assistant exists **only** as a global floating widget — `components/ui/FloatingChatWidget.jsx`, mounted once in `AppLayout` (including presentation mode) and anchored bottom-right. There is deliberately **no `/ai-assistant` route and no sidebar entry**: it is an ambient helper available on every authenticated page, not a destination.

- **Restored, not rewritten.** Session 5 removed the whole feature; session 6 brought the widget and its logic back from git unchanged apart from the notes below. The old full-page `AIAssistantPage.jsx` was *not* restored — the widget is the entire surface now.
- **Data flow** is unchanged: `chatService.sendMessage()` → live Grok proxy if `VITE_USE_LIVE_ASSISTANT=true`, otherwise (and on any failure) the canned `getDemoChatResponse`. Default is demo mode, so it works with no backend.
- **`server.js`** (optional, `npm run server`) holds `XAI_API_KEY` server-side; the key never reaches client code. Its system prompt was updated to list only the pages that still exist and to explicitly not mention the Simulator or Playbooks.
- **The "summarize" reply reads `mockDashboardKPIs`** instead of the hardcoded figures it used to carry (2,847 / 342 / $4.28M). Those were already stale after session 5 reconciled the dashboard mock, and an assistant quoting numbers that contradict the Overview beside it is worse than no assistant. **Keep it deriving from the KPIs.**
- Every `link` in `mockChatResponses` was checked against the current routes; none point at removed pages.

**Known rough edge:** the widget renders message text with `whitespace-pre-wrap`, not markdown, so `**bold**` and the one markdown table in `mockChatResponses` show their raw syntax. This is exactly how the widget always behaved (the deleted *page* was the thing that used `react-markdown`). Fixing it means either re-adding `react-markdown` or simplifying that mock copy — left as-is in session 6 because the brief was to restore the UI intact.

# Navigation (`layouts/AppLayout.jsx`)

The sidebar follows the product's workflow rather than listing pages alphabetically. Groups are defined once in `navGroups`:

```
DATA SETUP   Data Management        <- first, because nothing else works without it
MONITOR      Overview · Customers · Risk Analytics
RETENTION    Explainability · Recommendations · Outreach
(pinned bottom)  Executive View · Settings
```

- The Data Management entry carries a `Badge variant="medium"` reading **Required** until a dataset is connected, then a small accent check. Collapsed sidebar shows a dot instead. Screen readers get an `sr-only` "— setup required" / "— setup complete".
- `SidebarLink` is the single renderer for the desktop sidebar and the mobile drawer; `NavGroupLabel` renders the section headings (a divider when collapsed).
- Gated pages render as disabled entries with a lock icon while setup is incomplete — exempt paths come from `routes/accessRules.js`, so the nav and the route guard can never disagree.

# Components

Design system components in `src/components/ui/` were NOT modified except where noted. Reuse these for any new UI — do not create parallel one-off styled elements.

- **`ui/Tooltip.jsx`** (NEW, session 5) — **the** tooltip pattern; do not add another. `<Tooltip content>` wraps a trigger and opens on hover *and* focus; `<InfoTip content label>` is the info-icon affordance used next to metric titles, chart titles and table headers. It is a real `<button>`, so touch and keyboard users get the same content mouse users get. Rendered through a portal with fixed positioning (so table `overflow-x-auto` wrappers can't clip it), flips above/below based on available room, and closes on Escape.
- **`ui/ChartCard.jsx`** (NEW, session 5) — the standard frame for every chart: title + always-visible one-line description + info icon + built-in empty state. Pass `metricKey` to pull all three strings from `utils/glossary.js`. Used by Overview, Analytics, Customer Detail and Explainability.
- **`ui/MetricCard.jsx`** (extended, session 5) — gained `description` (visible supporting text) and `help` (tooltip detail). The trend arrow now also carries an `sr-only` "(improving)/(worsening)" so meaning isn't colour-only.
- **`src/components/data-setup/`** (2026-09-06) — the first-run data-onboarding flow, split out of `DataManagementPage` so no single file gets unwieldy. `steps.js` (the one definition of `SETUP_STEPS` and `PROCESSING_STAGES`), `SetupStepper.jsx` (5-column progress on `sm`+, compact "Step n of 5" bar below that), `UploadStep.jsx`, `ValidationStep.jsx`, `MappingStep.jsx`, `ProcessingStep.jsx`, `CompleteStep.jsx`. All built from the existing `ui/` primitives (Card, Button, Badge, Select) — no parallel design system. `DataManagementPage.jsx` is now purely the flow's state machine + service calls.

- **`ModelArchitecture.jsx`** (NEW, `src/components/`) — collapsible panel showing the 10-stage ML pipeline (Data → Cleaning → Leakage Removal → Scaling → PSO/ACO → TabNet → SHAP → Stacking Ensemble → FastAPI → Dashboard). Includes an explicit disclaimer that this is conceptual and predictions elsewhere in the app are demo data. Embedded in `ExplainabilityPage` (below the AI explanation) and in `DataManagementPage` (during the "Processing" step, `defaultOpen`).
- **`Hero3DBackground.jsx`** (NEW, `src/components/`, 2026-09-03) — decorative React Three Fiber scene for the landing page hero: ~40 small spheres colored by the same risk palette used elsewhere (mostly accent/green, a few amber/orange/red), loosely connected by thin lines, slowly rotating. Represents "many customers being watched, a few drifting into risk" without being literal — see spec section 10/11 ("Risk intelligence visualization", "floating customer/risk nodes"). Lazy-loaded from `LandingPage.jsx` via `React.lazy`/`Suspense fallback={null}` so it never delays the hero text/CTA's first paint. **Skips rendering entirely** (returns `null`) on `prefers-reduced-motion: reduce` or viewport width < 768px — verified via Playwright (`canvas` element count is 0 in both cases). Non-interactive: `pointer-events-none`, no orbit controls; verified the hero CTAs are still clickable through it.
  - **Placement is mask-driven, not position-driven**: the wrapping div's `mask-image` is an inverted radial gradient — `transparent` in the center ~40% (where the headline/subtitle/buttons live) fading to fully visible by ~78% radius. This keeps every node/line out of the readable text area while still framing the hero at the edges/corners. **If you ever see nodes overlapping the headline text again, the mask direction was likely flipped by mistake** — `transparent` = hidden, `black` = visible, and the *center* stop must be `transparent`.
  - Bundle note: the lazy chunk is ~230KB gzipped, almost entirely `three.js` core pulled in by `@react-three/fiber`'s `<Canvas>` — this doesn't meaningfully tree-shake regardless of import style (tried named imports from `three` instead of `import * as THREE`; no change). Accepted tradeoff since it's lazy, desktop-only, and loads after first paint. Don't try to chase this further without a real reason (e.g. don't add postprocessing/bloom libraries on top of it).

# Services (`src/services/api.js`)

Single service layer, already existed and is well-structured — extended, not replaced. Every service function checks `VITE_USE_MOCK_API` and either returns mock data (with a simulated `delay()`) or calls the real backend via the shared `apiClient` (axios, `baseURL` = `VITE_API_BASE_URL`, default `http://localhost:8000/api`).

Current: `authService`, `dashboardService`, `customerService`, `explainabilityService`, `recommendationService`, `outreachService`, `datasetService`, `chatService`, `notificationService`.

**Removed session 5:** `playbookService` and `simulatorService` — dead once Playbooks and the Simulator were removed.

**`chatService`** was removed in session 5 and **restored in session 6** along with `getDemoChatResponse`, `VITE_USE_LIVE_ASSISTANT` and `VITE_ASSISTANT_API_URL`. It now serves only the floating widget.

**Changed 2026-09-06 — `datasetService` now analyses the real file.** Its mock branch used to return hardcoded Telco statistics (7043 rows, 21 columns, 92% health) regardless of what the user uploaded. It now parses the actual CSV in the browser (`src/utils/csv.js`) and reports measured figures: row/column counts, per-column type + distinct + missing counts, total missing cells, exact duplicate rows, a real first-5-rows preview, and auto-suggested column mappings. The parsed dataset is held in a module-level `uploadedDatasets` Map between `uploadDataset` → `validateDataset` → `mapColumns` → `runPrediction` (same in-memory-store pattern as `playbooksStore`; resets on reload). Also exports `DATASET_UPLOAD` (the real upload limits, so the UI can state them accurately) and `DatasetError` (carries `message` + `hint` so the UI can say what's wrong *and* what to do). **The invented "dataset health %" was removed** — it was a made-up score; the UI now shows only measured facts. Real-backend branches are unchanged.

# API Routes (conceptual — for when a real FastAPI backend is connected)

Implied by `services/api.js`'s non-mock branches: `POST /auth/login`, `POST /auth/signup`, `GET /dashboard*`, `GET /customers`, `GET /customers/:id`, `GET /customers/:id/explanation`, `GET/PUT /customers/:id/recommendations`, `POST /customers/:id/outreach/generate`, `POST /datasets/upload|validate|map-columns|predict`, `POST /chat`, `POST /simulator/what-if`, and (new) `GET /playbooks`, `POST /playbooks`, `POST /playbooks/:id/toggle`. None of these are implemented server-side — connecting a real FastAPI backend means implementing these to match the shapes already used by the mock data (see `src/mock/*.js` for exact JSON shapes).

# Mock Data (`src/mock/`)

`customers.js`, `dashboard.js`, `explainability.js`, `recommendations.js`, `outreach.js`, `notifications.js`, `users.js`. All hand-authored, modeled loosely on the Telco Customer Churn dataset. (`playbooks.js` was deleted in session 5 with the feature that used it. `mockChatResponses` in `notifications.js` was deleted then too, but came back in session 6 with the AI assistant widget.) Do not scatter new mock data into components — add to this directory and wire through `services/api.js`.

**`dashboard.js` was made internally consistent (session 5).** The headline KPIs are now *derived* from the series in the same file instead of being typed separately, because they disagreed: "Customers at Risk" read 1,284 while the risk donut summed to 2,847 across four tiers, and "Revenue at Risk" read $4.28M while the trend chart's latest month said $2.04M. Now one `riskCounts` constant drives both the donut and the at-risk KPI (High + Critical = 984), the revenue KPI and its sparkline come off `mockRevenueAtRisk`, and every `change` is computed from its own series. **Don't reintroduce hand-typed KPI values** — a number on a card must match the chart under it. The redundant `highRiskCustomers` KPI was folded into `customersAtRisk` (Executive View was updated to match).

**New 2026-09-06:**
- `datasetSchema.js` — `CHURNGUARD_FIELDS`, the canonical list of fields a customer dataset maps onto (5 required: Customer ID, Tenure, Monthly charges, Contract type, Churn label; 3 optional: Total charges, Service/product tier, Payment method), each with a plain-language description, an example, and name aliases used for auto-matching. **This is the one definition** — the "Before you upload" requirements list, the validation report's required-field check, and the mapping UI all read it. Don't restate these fields anywhere else.
- `demoDataset.js` — builds a *real* 302-row Telco-shaped CSV (deterministic seeded PRNG, so it's byte-identical every run) including a few blank `TotalCharges` and two exact duplicate rows. It has to be real content because the setup flow now measures whatever it is given; a placeholder file would report 0 rows. Clearly labelled DEMO DATA throughout the UI.

# Demo Behavior

- **One-click demo entry**: Landing page "Explore Demo" button → `/login?demo=true`. `LoginPage` detects `?demo=true` and auto-submits the pre-filled demo credentials (`demo@churnguard.ai` / `demo2026`) on mount, landing on **`/data-management`** (changed 2026-09-06 — was `/dashboard`). From there "Use demo dataset" reaches the Overview in three more clicks, no CSV needed.
- **Use demo dataset**: `/data-management` step 1 offers it beside the real upload — builds a genuine CSV (`mock/demoDataset.js`) and runs it through the exact same upload → validate → map → process → predict pipeline as a real upload, so there's only one code path to maintain.
- **Demo mode indicator**: `AppContext.demoMode` (currently hardcoded `true`) shows a "DEMO" badge in the header/sidebar.
- Any mock/simulated result in the UI is explicitly labeled as such (outreach drafts state that they are a starting point for human review; Explainability's written summary says it is a demo write-up, not live model output; the data-setup completion screen distinguishes measured facts from simulated scores; `ModelArchitecture` says predictions are demo data).

# Dataset Ingestion — CSV / XLSX / XLS (session 5)

`utils/spreadsheet.js` is the single entry point: `readTabularFile(file)` returns `{ columns, rows, sheetName, sheetCount }` for **every** supported format, so validation, profiling, mapping and prediction have one downstream path. There is no separate Excel workflow.

- **CSV** → the existing `parseCsv` in `utils/csv.js` (delimiter sniffing, RFC-4180 quoting, BOM/CRLF handling).
- **XLSX / XLS** → SheetJS, **dynamically imported** so the ~430KB chunk only loads when someone actually picks a spreadsheet. Reads with `raw: false` so values arrive as the strings the user sees in Excel, not serial numbers. A workbook can have several sheets, so it uses the **first sheet that actually has a header row plus data** and reports which one — the validation screen says "sheet *Accounts* of 2".

Why SheetJS and not something else: it is the only library that reads both modern `.xlsx` and legacy binary `.xls`, and it was already a dependency (previously unused). `read-excel-file` and `exceljs` don't handle `.xls`, so supporting the required formats with one library meant SheetJS. **See Known Issues #4 for its security caveat before changing this.**

Verified by `utils/spreadsheet.test.js`, which builds real workbooks in memory and asserts an XLSX profiles and auto-maps identically to the same data as CSV.

# Metric Glossary (`utils/glossary.js`)

**One definition per metric, shared by every page that shows it.** Explaining "Revenue at Risk" one way on the Overview and differently on the Executive View is exactly the redundancy this file prevents. Each entry has:

- `label` — the visible name
- `description` — the short line shown under the value (visible, never hover-only)
- `help` — the extra detail behind the info icon; one or two sentences

Consumed by `MetricCard`, `ChartCard`, the Customers table headers, Customer Detail, Explainability and Recommendations. **If a metric needs describing, add it here and import it — don't write the copy inline.**

Everything in it must match the implementation: the risk-tier cut-offs quoted in `riskTier` come from `getRiskTier()` in `utils/helpers.js` (Low <35, Medium 35–59, High 60–79, Critical 80+), and the demo-data caveats are real.

# Self-Explanatory UI Rules (session 5)

The pattern applied across the app, in priority order:

1. **Visible label + short supporting text** — enough to understand the number without a mouse. This is what `MetricCard.description` and `ChartCard.description` are for.
2. **Info icon for the detail** — `InfoTip`, keyboard- and touch-accessible.
3. **Click to go deeper** — used only where there genuinely is more: Explainability's factor rows expand to show what was measured (the `description` field that already existed in `mock/explainability.js` but was never rendered), Customer Detail links to the full breakdown, the Overview's triage table links to Explainability and Outreach.

Deliberate constraints:
- **Never hover-only.** Anything essential is visible or reachable by keyboard.
- **Never colour-only.** Risk uses a coloured badge *with* a label; trends carry an `sr-only` improving/worsening note.
- **One tooltip implementation.** `ui/Tooltip.jsx`.
- **Each page has a distinct job** — Overview: portfolio-level risk. Customers: account-level risk. Customer Detail: this account's state and weakest signal. Explainability: factor-level attribution. Don't repeat a level on another page.

# Post-Login Flow & Dataset-Setup Gate (2026-09-06)

**The flow.** `Landing → Login/Signup → (Signup only: Onboarding) → Data Setup → Overview`.
Login now lands on `/data-management`, not `/dashboard`. Signup still goes to `/onboarding`, and both of that wizard's exits ("Continue to data setup" and "Skip for now") lead to `/data-management` — there is deliberately only one onboarding path, with the company/goals wizard as optional context *before* the required data step.

**How the gate works.**
- `AppContext` holds `datasetSetupComplete`, `activeDataset` (the completed dataset's summary) and `datasetSetupHydrated`. Actions: `completeDatasetSetup(summary)` and `resetDatasetSetup()`. No new state library — this is the existing Context/reducer architecture.
- `ProtectedRoute` redirects to `/data-management` when the route requires a dataset and none is connected. `AuthRoute` sends already-authenticated users to `/dashboard` or `/data-management` depending on the same flag.
- `AppLayout` renders gated nav items as disabled entries with a lock icon (plus a dot on Data Management) instead of live links, so the user never clicks into a redirect.

**Persistence and the two traps in it.**
- The record is persisted under one key, `churnguard_dataset_setup`, written *only* from `AppContext` (don't scatter `localStorage` calls elsewhere). It stores `userKey` (the signed-in user's email) and is restored only when that matches the current user — so logout, a 401-triggered reload, or a different account all start setup fresh, with no separate cleanup code needed in `AuthContext` or `api.js`.
- **`datasetSetupHydrated` is load-bearing.** `AppProvider` is a child of `AuthProvider`, so on a refresh React runs the child's effect *first* (auth still loading), then auth resolves, then the App effect restores the record. In that one-render gap `isAuthenticated` is true but `datasetSetupComplete` is still false — without the flag, every refresh of `/dashboard` bounced a fully set-up user back into onboarding. Both guards wait for it. This was caught in the browser, not by reading code; don't remove it.

**Honesty rules this flow follows** (they're why several things look the way they do):
- Everything the validation screen reports is *measured from the user's file* — rows, columns, per-column type/distinct/missing, total missing cells, exact duplicate rows, preview. The old hardcoded "7043 rows / 92% health" numbers are gone, and the invented health score was deleted rather than reimplemented.
- The completion screen's "already churned" count is read out of the mapped churn column — a fact, not a prediction — and the screen states plainly that risk scores elsewhere in the app are simulated demo output.
- **Uploads are CSV, XLSX and XLS** — and all three are genuinely parsed (session 5; see "Dataset Ingestion" below). The UI's format list and size limit both render from `DATASET_UPLOAD` in `services/api.js`, which in turn takes its extension list from `SUPPORTED_EXTENSIONS` in `utils/spreadsheet.js`. **That chain is deliberate: the UI cannot advertise a format the parser doesn't handle.** Never add an extension to the dropzone without adding a reader for it.
- Processing stages are paced (~550ms each) so the user can read them. They are UI representations of the prototype workflow, and the screen says so; no claim is made that a model is training.

# Completed Features (as of 2026-09-07, session 6)

Everything in the product's core journey works end-to-end and was verified in a real headless-Chromium run (Playwright), not just by reading code:
Landing (with 3D risk-node hero background) → Explore Demo (one-click) → **Data Setup (required: upload CSV/XLSX/XLS or the demo dataset → validate → map columns → process → predictions)** → Overview → Customers → Customer Detail → Explainability → Recommendations → Outreach (AI draft, human-approve) → Risk Analytics → Executive View → Settings → Onboarding (post-signup, feeds into Data Setup). The AI assistant is available throughout as a floating bottom-right widget.

No XGBoost anywhere. No secrets in the repo (`.env` is gitignored; the only key the project ever held, `XAI_API_KEY`, went away with the AI Assistant).

# Current Development State

Stable. `npm run build`, `npm run test` (**39 tests, 4 files**) and `npm run lint` all pass. Lint reports **53 warnings**, down from 121 at the end of session 4 and a 130 baseline before session 4 — the drop is mostly the removed pages taking their unused imports with them. Every remaining warning is a pre-existing pattern (unused imports in `LandingPage`, a few `react-hooks/exhaustive-deps`, and `react(only-export-components)` on `routes/index.jsx`); **none are in any file added in sessions 4 or 5**. If you add exported constants next to a component, oxlint's `react(only-export-components)` will flag it — put them in a plain `.js` module instead (that's why `components/data-setup/steps.js` exists).

# Pending Work

- **Recharts bundle size** — `npm run build` warns about a >500kB chunk (`index-*.js`, mostly Recharts + core). Pre-existing, not addressed — would need route-level chart code-splitting if it becomes a real problem.
- **`date-fns` and `@react-three/drei` are still installed and unused.** Both were already dead before session 5 and are unrelated to anything removed there, so they were left alone rather than widening the change. Safe to drop in a dedicated dependency pass.
- Onboarding data (company/industry/goals) is collected but not persisted anywhere (no backend, no localStorage) — purely a UX flow demonstration. If a future agent wants it to "stick," it should go through `AppContext` (which now has the pattern for exactly this — see the dataset-setup record) or a new mock service, not ad-hoc localStorage.
- **Uploaded CSVs are parsed on the main thread.** Fine for realistic files (the 302-row demo parses instantly), but a 50MB CSV would block for a couple of seconds. If that ever matters, move `parseCsv`/`profileDataset` into a Web Worker — they're already pure functions in `src/utils/csv.js` with no DOM dependencies, so it's a contained change.
- **Settings is still a UI shell.** The Profile / Notifications / Appearance / Data tabs collect values and toast "saved", but nothing persists (no backend, and deliberately no localStorage sprawl). The Data source tab is now accurate and read-only. If these should stick, route them through `AppContext` the way the dataset-setup record does.
- **The dataset the user connects doesn't drive the rest of the app.** Setup measures and reports the real file, then the Overview/Customers pages still render `mock/dashboard.js` + `mock/customers.js` (2,847 customers). The UI is explicit about this on the completion screen, but wiring the uploaded rows through to those pages — or connecting the real backend — is the obvious next step.

# Known Issues

1. **(Fixed 2026-09-03, documented so it isn't reintroduced)** `src/index.css` had an **unlayered** global reset (`* { margin:0; padding:0; box-sizing:border-box }` directly in the stylesheet, not inside `@layer base`). Under Tailwind v4's CSS Cascade Layers, unlayered rules beat ALL layered rules (including every Tailwind utility) regardless of specificity — this silently zeroed out `margin-left`/`margin-right`/etc. utilities app-wide, which broke the sidebar's `lg:ml-60`/`lg:ml-16` content offset on **every single authenticated page** (content rendered underneath the fixed sidebar, clipped). Fixed by wrapping the reset in `@layer base { ... }`. **Rule for future CSS edits in this file: any new global/reset-style rule (bare element or `*` selectors) MUST go inside `@layer base { }`, or it will silently override Tailwind utilities again.** Verified fixed via computed-style inspection (`margin-left` now correctly resolves to `240px`) and a full Playwright run through every major page.
2. Duplicate React key warning in `DataManagementPage`'s column-mapping `<Select>` (the current-value option duplicated one of the fixed target options) — fixed 2026-09-03 by deduplicating the options list.
3. **`npm audit` reports moderate advisories in `qs` (via `express`)** with no working fix — `npm audit fix` does not resolve them. These went away in session 5 when `server.js` was deleted and came back in session 6 when the AI assistant widget (and its optional Grok proxy) were restored. Real-world risk here is negligible: `server.js` runs locally only, is never deployed, is opt-in via `VITE_USE_LIVE_ASSISTANT`, and exposes a single JSON POST route with no query-string parsing. Re-check when a patched `express` ships. If the live-Grok path is ever dropped for good, deleting `server.js` + `express` + `dotenv` clears it again.
4. **`xlsx` (SheetJS) has a high-severity advisory with no fix available on npm, and session 5 started actively using it for XLSX/XLS parsing.** This was a deliberate, documented trade-off:
   - The advisories are CVE-2023-30533 (prototype pollution) and a ReDoS, both triggered by parsing a **maliciously crafted spreadsheet**. Fixed upstream in SheetJS 0.19.3+/0.20.2+, but SheetJS left npm at 0.18.5, so `npm audit fix` cannot resolve it.
   - Risk here is contained: the file is the user's own, it is parsed entirely client-side in their own browser, and nothing is transmitted anywhere. The worst case is a corrupted or hung tab for the person who chose the file — there is no server and no other user's data to reach.
   - Alternatives were considered and rejected: `read-excel-file` and `exceljs` cannot read legacy `.xls` (so they'd fail the requirement), and `@e965/xlsx` — an unofficial republish of the patched 0.20.3 — trades a known advisory for unvetted supply-chain risk.
   - **If this ever handles untrusted uploads or moves to production, switch to the official SheetJS CDN build (`https://cdn.sheetjs.com/xlsx-0.20.x/`) — that is the supported upgrade path.** Only `utils/spreadsheet.js` imports it, so it is a one-file change.
5. **`README.md` still contains unresolved merge-conflict markers** (`<<<<<<< HEAD` at line 1, `=======` at line 80, `>>>>>>> 684a4db` at line 108), despite commit `2d1bfaf` "Resolve merge conflict in README.md". Found 2026-09-06; left alone as out of scope for that session's task, but it should be resolved — the file currently documents the project twice. Note the HEAD half also has stale facts (says React 18 / Tailwind v3 / Router v6; the app is React 19 / Tailwind v4 / Router v7).
6. `backend/` (added in the `create genric model for dataset` / `llm integrate` commits) is **not wired to the frontend at all** — `backend/api/generic_routes.py` says so in its own docstring, and its endpoints (`/generic/train|predict|explain`) don't match the paths `services/api.js` calls (`/datasets/upload|validate|map-columns|predict`). Connecting them means reconciling those two contracts. Not attempted 2026-09-06; the frontend task was state/routing/UX only.
8. ~53 pre-existing ESLint/oxlint warnings — mostly unused imports in `LandingPage.jsx`, a few `react-hooks/exhaustive-deps`, and `react(only-export-components)` on `routes/index.jsx`. Not fixed: they predate sessions 4–5 and are unrelated to those tasks. Safe to clean up in a dedicated pass.

# Important Design Decisions

- **Kept Vite/React instead of migrating to Next.js**, despite the spec architecture diagram saying "Next.js Dashboard" — the inherited codebase was already a mature Vite SPA; rewriting the framework would have been a large, unjustified refactor of working code. See Architecture section.
- **Onboarding is a separate "bare" route**, not wrapped in the normal `AppLayout` sidebar — it's a linear first-run flow, not part of the main app shell. Added a `BareProtectedRoute` helper in `routes/index.jsx` for this (same auth guard as `ProtectedRoute`, no chrome).
- **Package renamed** `antigravity-workspace` → `churnguard-frontend` in `package.json` for clarity (cosmetic only, no functional impact).
- **Dataset setup gates the app rather than being a side page** (2026-09-06) — the alternative (a "Go to Dashboard" button with routes left open) would have let anyone skip the one input the product needs. The gate lives in the existing Context + router, not a new state library.
- **Column mapping is field-centric, not column-centric** — one row per ChurnGuard field with a dropdown of *your* columns, rather than one row per uploaded column. It still reads left-to-right as "your dataset column → ChurnGuard field", but it makes required-vs-optional and completeness obvious, and it doesn't produce 21 dropdowns for a 21-column file. The wire format sent to `mapColumns` is unchanged: `{ yourColumnName: churnguardFieldKey }`.
- **Three features were removed outright (session 5): AI Assistant, What-If Simulator, Playbooks/Automation.** Not hidden — routes, pages, services, mock data, the floating chat widget, the Grok proxy server and its dependencies all went. See the changelog for the full list. Removed routes now 404, which is correct: they are gone from the product.
- **Metric copy lives in one file, not in the components** — `utils/glossary.js`. Two pages describing the same number differently is the failure mode this prevents.
- **Tooltips are supplementary, never the only source.** Every metric shows a visible description; the info icon adds detail. This keeps the UI usable on touch, where hover does not exist.
- **The demo dataset is a real generated CSV, not a stub** — once the flow measures whatever it's handed, a placeholder file would honestly report "0 rows". Generating real content keeps one code path for demo and real uploads and keeps every displayed number true.

# Important Constraints

- **NO XGBOOST.** Anywhere. Ever. Re-audit (`grep -ri xgboost` across `src/`, `*.md`, `package.json`) after any large change, especially if copying content from the reference `.pptx`/`.pdf` docs on the Desktop.
- **`XAI_API_KEY` must never move into a `VITE_`-prefixed variable or any client-side file** — that would ship it in the browser bundle. It lives in `.env` (gitignored) and is read only by `server.js` (a Node process).
- Do not claim mock/simulated data is a real model result in UI copy — always label appropriately (already the pattern throughout; keep it).
- Don't create duplicate components/pages for small variations — extend what's in `src/components/ui/` and `src/pages/`.

# Integration Assumptions

- A real backend is assumed to be **FastAPI**, base URL configured via `VITE_API_BASE_URL`, matching the endpoint shapes implied by `services/api.js`'s non-mock branches (see API Routes above).
- `backend/` exists in this repo but is **not wired to the frontend** — see Known Issues #6.

# Future Backend Integration

To connect a real backend: set `VITE_USE_MOCK_API=false` and `VITE_API_BASE_URL` in `.env`. No frontend code changes should be required as long as the backend matches the JSON shapes in `src/mock/*.js` (these are the de facto API contract). Auth currently stores a bearer token in `localStorage` (`churnguard_token`) — fine for a prototype, should move to httpOnly cookies for real production use (already flagged in `DEVELOPMENT.md`, not addressed here — out of scope for a frontend prototype task).

# Performance Notes (read before adding visual effects)

Measured with Playwright + 4× CPU throttling (`Emulation.setCPUThrottlingRate`), scrolling the page for ~2s and sampling `requestAnimationFrame` + `longtask` entries. Scripts are throwaway; re-create as needed.

| | before | after |
|---|---|---|
| Landing scroll | **9.9 fps**, 8+ long tasks (60–143ms) | **60 fps**, 0 long tasks |
| Dashboard scroll (first 2s) | 36.9 fps, 14 long tasks | 52.9 fps, 3 long tasks |
| Dashboard scroll (settled) | 60 fps | 60 fps |
| Navigation (click → content) | 250–560ms | 200–390ms |

What was actually slow, in order of impact:

1. **Two `fixed` half-viewport `blur-[150px]` divs with `mix-blend-screen`** on the landing page. A filter blur that large on a fixed element re-composites every scroll frame. Replaced with plain radial-gradient backgrounds — visually equivalent, essentially free. **Do not put large blur radii on fixed/large elements.** Same reasoning applied to `backdrop-blur-2xl` on the hero panel (it sat over a 95%-opaque background, so it was pure cost for no visible effect).
2. **The 3D hero canvas.** Originally one `<mesh>` per node (~70 draw calls/frame). Now a single `<points>` + single `<lineSegments>` = 2 draw calls. Also DPR 0.85, `antialias: false`, no lights/postprocessing, and the render loop is paused via IntersectionObserver when the hero scrolls away.
3. **Chart entrance animations.** 6 KPI sparklines + 4 Recharts charts all animating on mount (Recharts defaults to 1500ms) produced a jank burst for the first few seconds on the dashboard. Sparklines now use `isAnimationActive={false}`; the main charts use `animationDuration={500}`. Steady-state was always 60fps — this was purely a mount-burst problem.
4. **Artificial mock latency.** `services/api.js` simulated 400–3000ms network delays on every fetch. Now routed through a single `mockDelay()` wrapper that scales them (`MOCK_LATENCY_SCALE = 0.22`, capped at 600ms), so skeleton/loading states still appear but nothing feels sluggish. The original per-call numbers are left in place as documentation — raise the scale toward 1 to demo slow-network behaviour.
5. **Page transition dead time.** `AnimatePresence mode="wait"` in `AppLayout` ran a full exit animation before entering on every navigation; exit is now 0.08s.

**Important measurement caveat:** headless Chromium renders WebGL in software (SwiftShader), so any headless FPS number for the 3D canvas is far worse than reality. To judge the 3D honestly, run Playwright with `headless: false` and `--enable-gpu` (on this machine that reports `ANGLE (Intel UHD Graphics …)` and gives ~56–58fps).

# Changelog

**2026-09-07 (session 6)** — AI assistant restored as a global floating widget.

*Why:* session 5 removed the assistant entirely. The ask was to bring the chatbot back but as an ambient widget rather than a navigation destination.

- **Restored from git, unchanged:** `src/components/ui/FloatingChatWidget.jsx`, `chatService` + `getDemoChatResponse` in `src/services/api.js`, `mockChatResponses` in `src/mock/notifications.js`, `server.js`, the `/api/assistant` dev proxy in `vite.config.js`, the assistant vars in `.env.example`, and the `express`/`dotenv` dependencies plus the `server` script.
- **Mounted globally** in `src/layouts/AppLayout.jsx` — once, bottom-right, on every authenticated page including presentation mode. **The `/ai-assistant` route and its sidebar entry were deliberately not restored**; the widget is the whole feature now, and the old full-page `AIAssistantPage.jsx` stays deleted.
- **Three deliberate deviations from a literal restore**, each because the surrounding app changed underneath it:
  1. The "summarize" demo reply had 2,847 / 342 / $4.28M baked in; session 5 had already changed those to 2,847 / 984 / $2.04M. It now reads `mockDashboardKPIs` so the assistant can't quote numbers the Overview contradicts.
  2. `server.js`'s system prompt listed "Simulator" and "Playbooks" as places to navigate. Updated to the pages that actually exist, with an explicit instruction not to mention the removed ones.
  3. Dropped an unused `Button` import and an unused `catch` binding from the widget, so it lands lint-clean.
- **`AppContext` was left alone** — the widget uses local state; the `chatOpen`/`copilotOpen` keys removed in session 5 were never read by it and stay removed.
- **Trade-off to be aware of:** restoring `express` reintroduces the moderate `qs` advisories that session 5's removal had cleared. `npm audit fix` cannot resolve them. See Known Issues #3 for why the practical risk here is negligible.
- **Verified in headless Chromium: 21/21 widget checks** — launcher present on all 9 authenticated routes and during data setup, anchored 24px from the bottom-right, opens, greets, returns demo replies ("Which customers are at highest risk?" → DataSphere 88.1%), the summary quotes 2,847 / 984 / $2.04M matching the Overview, minimise/restore/close all work, and no horizontal overflow at 390px. Plus **the full 61/61 app suite re-run** to confirm nothing regressed: no assistant nav item, `/ai-assistant` still 404s, and every page still renders.
- `npm run build`, `npm run test` (39 tests) and `npm run lint` (53 warnings, unchanged) all pass. XGBoost audit clean.

**2026-09-06 (session 5)** — Multi-format dataset upload, sidebar restructured around the workflow, three features removed, and a self-explanatory-UI pass across every remaining page.

*Why:* the app supported one file format while advertising three, listed pages in no particular order, carried three features that weren't part of the retention story, and showed numbers (KPIs, risk scores, SHAP values, table columns) with no indication of what they meant.

- **Multi-format ingestion (CSV · XLSX · XLS)** — **new** `src/utils/spreadsheet.js` (`readTabularFile`, one `{columns, rows, sheetName}` shape for every format; SheetJS dynamically imported; picks the first sheet with data and reports it), `src/services/api.js` (`DATASET_UPLOAD` now carries the real extension list and dropzone `accept` map; `readDataset` replaces the CSV-only reader), `src/components/data-setup/UploadStep.jsx` (a "Supported formats" block rendered from that list; rejection messages name the real formats), `ValidationStep.jsx` (reports which sheet was read). **new** `src/utils/spreadsheet.test.js` — 11 tests building real workbooks in memory, including a legacy `.xls`.
- **Sidebar restructured** — `src/layouts/AppLayout.jsx`: `navGroups` (Data Setup → Monitor → Retention, plus a pinned Executive View/Settings), a `NavGroupLabel` component, and a Required/complete status on the Data Management entry using the existing `Badge`. Data Management is now first.
- **Removed AI Assistant, What-If Simulator, Playbooks** — deleted `AIAssistantPage.jsx`, `SimulatorPage.jsx`, `PlaybooksPage.jsx`, `CreateAutomationPage.jsx`, `ui/FloatingChatWidget.jsx`, `mock/playbooks.js`, `server.js`; removed `chatService`/`playbookService`/`simulatorService` and `mockChatResponses`; removed their routes, the header AI shortcut, the Customer Detail "Ask AI Assistant" action, the Explainability "What-If Analysis" button, the now-dead `chatOpen`/`copilotOpen` state in `AppContext`, the Vite assistant proxy, the assistant env vars, and the `express`/`dotenv`/`react-markdown` dependencies (136 packages, and the `qs` advisory with them).
- **Self-explanatory UI** — **new** `src/utils/glossary.js` (one definition per metric), **new** `ui/Tooltip.jsx` (`Tooltip` + `InfoTip`, portal-based, hover **and** focus, Escape to close), **new** `ui/ChartCard.jsx` (title + visible description + info icon + empty state), extended `ui/MetricCard.jsx` (`description`, `help`, `sr-only` trend direction). Applied to: **Overview** (rewritten — 5 differentiated KPIs, described charts with legends, a triage table with explained columns), **Customers** (labelled filters, active-filter chips, result count, per-column tooltips, `aria-sort`, accessible checkboxes and icon buttons, real error/empty states), **Customer Detail** (a "Why this account is scored this way" bridge, explained score bars, risk trend as a `ChartCard`, plain-language actions, real not-found state), **Explainability** (rewritten framing — "Why this account is at risk", a plain-English legend, a zero reference line, and factor rows that expand to reveal the `description` already in the mock but never rendered), **Recommendations** (the account's risk shown alongside, "Why it's being suggested" / "How to do it", explained impact score), **Outreach** (the review path shown as a flow instead of a warning banner, plus what each draft was written from), **Analytics** (rewritten — every chart has a description, units, period and legend), **Data Management** (per-step guidance under the stepper).
- **Dashboard mock made internally consistent** — `mock/dashboard.js` now derives KPIs from the series in the same file; see the Mock Data section for what disagreed and why it matters.
- **New helper** `getPrimaryRiskDriver()` in `utils/helpers.js` — replaces the Overview's hardcoded "Top Reason" column (which printed one of two strings based on tier) with the account's genuinely weakest signal, normalised across usage / engagement / logins / NPS / open tickets.
- **Removed dead controls** — the Overview date-range selector and both Export buttons did nothing at all; the Recommendations "Edit" button and the Outreach "Regenerate" button had no handlers. Export and date-range were removed; Regenerate was wired to the existing `outreachService.generateEmail`. Also fixed Settings' data-source badge, which tested `VITE_USE_MOCK_API === 'true'` and so reported demo data as OFF whenever no `.env` existed — the opposite of the truth.
- **Verified in headless Chromium: 61/61 checks.** Login → Data Management first in the sidebar → real `.xlsx` upload with non-obvious headers (`account_id`, `months_active`, …) auto-mapped 5/5 → mapping → processing → complete → Overview; legacy `.xls` parsed; a `.pdf` refused with a useful message; all four removed routes 404; no removed feature in the sidebar; sidebar Required → complete; tooltips open on keyboard focus and close on Escape; every remaining page renders; unknown customer shows a real error state; and zero horizontal overflow across 9 routes at 390px and 820px. Only console output is a pre-existing favicon 404.
- `npm run build`, `npm run test` (39 tests) and `npm run lint` (53 warnings, down from 121; none new) all pass. XGBoost audit clean.

**2026-09-06 (session 4)** — Dataset upload made the mandatory first step after login, and the Data Management page rebuilt as a real first-run onboarding experience.

*Why:* the product let users land straight on an Overview populated by demo data they never provided. The dataset is the thing the whole product depends on, so it now gates everything else, and the setup page had to become good enough to be someone's first screen.

- **Flow / gating** — `src/context/AppContext.jsx` (dataset-setup state + user-scoped persistence + hydration flag), `src/routes/index.jsx` (gate in `ProtectedRoute`, dataset-aware `AuthRoute`), **new** `src/routes/accessRules.js` (the shared exempt-path list), `src/layouts/AppLayout.jsx` (locked nav items via a new shared `SidebarLink`, replacing four near-identical `NavLink` blocks), `src/pages/auth/LoginPage.jsx` (→ `/data-management`), `src/pages/OnboardingPage.jsx` (both exits → `/data-management`, copy updated so it reads as *before* the required step). See "Post-Login Flow & Dataset-Setup Gate" above.
- **Data setup UX** — `src/pages/DataManagementPage.jsx` rewritten as the flow's state machine; **new** `src/components/data-setup/` (steps.js, SetupStepper, UploadStep, ValidationStep, MappingStep, ProcessingStep, CompleteStep). 5-step stepper + breadcrumb, an upload area that states real formats/limits/expected structure, a "Before you upload" field guide, a clearly-labelled demo option, a validation report that explains what/why/what-to-do, field-centric column mapping with required-field enforcement and duplicate detection, a staged processing screen, and a completion screen with a "View Overview →" CTA. Built entirely from existing `ui/` primitives.
- **Real numbers instead of hardcoded ones** — **new** `src/utils/csv.js` (RFC-4180-ish parser with delimiter sniffing + dataset profiler), **new** `src/mock/datasetSchema.js` (the canonical ChurnGuard field list), **new** `src/mock/demoDataset.js` (a genuine deterministic 302-row demo CSV), and a rewritten `datasetService` in `src/services/api.js`. Mock-vs-real branching and every real-backend call are unchanged; nothing bypasses the service layer.
- **Fixed two real bugs found while testing:**
  1. `src/pages/AIAssistantPage.jsx` used `<CardHeader>` without importing it — the AI Assistant page threw `ReferenceError: CardHeader is not defined` and rendered the router error boundary. Pre-existing since the initial commit (oxlint had been flagging it as `react(jsx-no-undef)`). One-line import fix.
  2. `src/layouts/AppLayout.jsx`'s content wrapper was missing `min-w-0`, so its flex auto-minimum size was its content's min-content width. That's why `main`'s `overflow-x-hidden` and every `overflow-x-auto` table wrapper never actually worked: one wide table stretched the whole page sideways instead of scrolling inside its card. Verified the customers/dashboard/executive tables now scroll in place at tablet and mobile widths (content still reachable, nothing clipped).
- **Tests** — **new** `src/utils/csv.test.js`, 21 tests covering quoting/BOM/CRLF/delimiter cases, profiling (missing values, duplicates, type inference, preview), churn-label counting, mapping suggestions, and the demo dataset's determinism and stats. Suite is now 27 tests / 3 files, all passing.
- **Verified in a real headless-Chromium run** (Playwright, installed outside the repo so `package.json` was untouched): 47/47 scripted checks across Flow A (normal login → upload → validate → map → process → complete → dashboard), Flow B (direct navigation to `/dashboard`, `/customers`, `/analytics`, `/playbooks`, `/executive` all redirect; `/settings` stays reachable), Flow C (one-click demo end to end), Flow D (all nine sidebar destinations after setup), refresh persistence, "Replace dataset" re-locking, a real uploaded CSV with non-matching column names (manual mapping path), and zero horizontal overflow on the upload/validate/map/complete steps at 390px, 820px and 1440px. Separately re-checked all 14 authenticated routes at those three widths — all render, none overflow, no console errors (only a pre-existing `/favicon.ico` 404).
- `npm run build`, `npm run test`, `npm run lint` all pass. Lint went **130 → 121** warnings (baseline measured from `git archive HEAD`); no new warnings introduced.

**2026-09-03 (session 3)** — Smoothness pass + made the 3D actually visible.
- User reported the site felt sluggish and the 3D wasn't visible at all. Both were real; see Performance Notes above for the measured before/after.
- `src/pages/LandingPage.jsx`: replaced the two giant blur glows with radial gradients, dropped the hero panel's `backdrop-blur-2xl`, lightened the nav blur, converted an `blur-[80px]` glow to a gradient.
- `src/components/Hero3DBackground.jsx`: rebuilt as a single points cloud (was per-node meshes), additive-blended soft dot sprites, 130 nodes, wider spread, brighter lines. **Why it was invisible before:** the radial mask's clear zone was far too large and the nodes were small/dim, so almost the whole field was masked away — only a handful of faint dots survived at the extreme edges. Mask clear-zone tightened and node size/brightness raised.
- Added two safety nets to that component: (a) `hasUsableWebGL()` skips the effect when the renderer is SwiftShader/llvmpipe/software (blocklisted GPUs, VMs, remote desktop), (b) a runtime FPS guard that disables it if the machine can't sustain 20fps. **Gotcha worth remembering:** the first version of that guard sampled immediately on mount, caught normal page-load jank, and intermittently disabled the effect on a perfectly capable GPU. It now waits 1.2s to settle before sampling for 1.2s.
- `src/services/api.js`: all `delay(...)` calls routed through a new scaled `mockDelay(...)`.
- `src/components/ui/MetricCard.jsx`: sparklines no longer animate on mount.
- `src/pages/DashboardPage.jsx`: chart `animationDuration={500}`.
- `src/layouts/AppLayout.jsx`: shortened page-transition exit.
- Verified: build/lint/test pass, full golden-path smoke test green with zero console errors, plus GPU-mode screenshots of landing (3D visible, text clean), dashboard, and mobile (3D correctly absent).


**2026-09-03 (later same day)** — 3D landing hero polish.
- Added `src/components/Hero3DBackground.jsx` (React Three Fiber node-field visualization) and wired it into `src/pages/LandingPage.jsx` (lazy-loaded, `Suspense fallback={null}`, wrapped existing hero `FadeIn` children in `relative z-10` so they stack above the canvas).
- Iterated on the design after visually reviewing a screenshot: initial version had nodes/a wireframe "core" sitting directly on top of the headline text (mask direction was inverted). Fixed by flipping the radial `mask-image` so the center (text zone) is `transparent` and nodes only appear toward the edges/corners; removed the central "core" icosahedron entirely since it no longer served a purpose once the center was cleared.
- Dropped a `@react-three/drei` `<Line>` usage in favor of a single hand-built `lineSegments`/`BufferGeometry` — didn't reduce bundle size but is one fewer thing depending on drei.
- Fixed 5 new `react(purity)` lint warnings (`Math.random()` called inside `useMemo`) by switching the one-time randomized node/edge generation to `useState`'s lazy-initializer pattern instead — the correct React idiom for non-deterministic one-time setup.
- Verified via Playwright: canvas renders on desktop, is absent (returns `null`) on mobile-width viewports and under `prefers-reduced-motion: reduce`, hero CTAs remain clickable through it, and no console/page errors. Also re-ran the full golden-path smoke test from the previous session — still green, plus the earlier duplicate-React-key console warning is gone (fixed in the prior pass, confirmed here).
- `npm run build`/`lint`/`test` all pass; lint warning count unchanged from before this pass (136, same pre-existing set — the 5 purity warnings introduced mid-session were fixed before considering this done, not left in).

**2026-09-03** — Onboarding flow, Playbooks/Automation, Model Architecture visualization, Grok AI Assistant server-side integration, one-click demo login, "Use Demo Dataset" shortcut, and a critical CSS cascade-layer bug fix.
- Copied `Antigravity_workspace` → this repo (`PRT 1`) per user decision; `PRT 1` is now the canonical project root.
- Added: `src/pages/OnboardingPage.jsx`, `src/pages/PlaybooksPage.jsx`, `src/pages/CreateAutomationPage.jsx`, `src/components/ModelArchitecture.jsx`, `src/mock/playbooks.js`, `server.js`, `.env.example`, `.env`.
- Changed: `src/routes/index.jsx` (new routes + `BareProtectedRoute`), `src/layouts/AppLayout.jsx` (Playbooks nav item), `src/pages/auth/SignupPage.jsx` (redirect to `/onboarding`), `src/pages/auth/LoginPage.jsx` (`?demo=true` auto-submit), `src/pages/LandingPage.jsx` (Explore Demo → `/login?demo=true`), `src/pages/ExplainabilityPage.jsx` (embed `ModelArchitecture`), `src/pages/DataManagementPage.jsx` (Use Demo Dataset button, embed `ModelArchitecture`, dedupe column-mapping option keys), `src/services/api.js` (`playbookService`, live/demo split for `chatService`), `src/index.css` (**critical fix**: wrapped global reset in `@layer base`), `vite.config.js` (dev proxy for `/api/assistant`), `package.json` (renamed, added `express`+`dotenv`, added `server` script), `.gitignore` (ignore `.env`).
- Verified via `npm run build`/`lint`/`test` and a full Playwright headless-browser run through the entire golden path (see Known Issues #1 for how that run caught a real bug).
- Confirmed zero XGBoost references repo-wide.

# Things That Must NOT Be Changed

- **NO XGBOOST** — see Important Constraints.
- The `@layer base { ... }` wrapper around the global reset in `src/index.css` — removing it reintroduces the sidebar-offset bug described in Known Issues #1.
- The mock-vs-real branching pattern in `src/services/api.js` (`if (USE_MOCK) { ... } return apiClient...`) — this is the seam that lets a real backend swap in without UI changes. Don't bypass it with direct fetches in components.
- Don't rename `PROJECT_MEMORY.md` or `claude.md`, and don't create duplicate copies of either.
- Don't reintroduce large-radius blurs (`blur-[100px]`+) or `backdrop-filter` on fixed/full-viewport elements — that cost the landing page ~50fps of scroll performance (see Performance Notes).
- Don't convert the hero 3D back to one mesh per node, and don't remove its WebGL/FPS guards — those are what keep the effect from tanking weaker machines.
- **`datasetSetupHydrated` in `AppContext`, and the guards that wait on it** — removing it reintroduces the refresh bounce described in "Post-Login Flow & Dataset-Setup Gate".
- **`min-w-0` on `AppLayout`'s content wrapper** (`div.flex-1 min-w-0 flex flex-col`) — without it, `main`'s `overflow-x-hidden` and every `overflow-x-auto` table wrapper are inert and any wide table stretches the whole page sideways.
- **Don't re-add XLSX/XLS to the upload dropzone without actually parsing those formats** — see the honesty rules in the flow section above.
- **Don't reintroduce hardcoded dataset statistics** in `datasetService`'s mock branch (row counts, health scores, fabricated missing-value percentages). The setup flow's credibility rests on those numbers being measured from the user's file.
- Keep the dataset-setup record's `localStorage` access inside `AppContext` — one key, one reader, one writer.
- **Don't add a second tooltip implementation.** `ui/Tooltip.jsx` is it. It portals deliberately (table wrappers would clip an in-flow tooltip) and opens on focus deliberately (keyboard/touch parity).
- **Don't let the upload UI's format list drift from the parser.** It renders from `DATASET_UPLOAD.extensions` → `SUPPORTED_EXTENSIONS` in `utils/spreadsheet.js`. Adding an extension without a reader re-creates the exact dishonesty session 4 removed.
- **Don't reintroduce hand-typed KPI values in `mock/dashboard.js`.** They are derived so a card and the chart beneath it can't disagree.
- **Don't re-add Simulator / Playbooks navigation** without also restoring the pages, services and mock data — the sidebar must never offer a link that 404s.
- **Don't turn the AI assistant back into a page or a sidebar item.** It is intentionally a global floating widget (session 6). Mount it once, in `AppLayout`.
- **Don't hardcode portfolio figures into `getDemoChatResponse`** — the "summarize" reply derives them from `mockDashboardKPIs` so the assistant can't contradict the Overview.
