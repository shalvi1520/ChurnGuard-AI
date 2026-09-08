# PROJECT_MEMORY.md — ChurnGuard Frontend

**Read this file AND `claude.md` before starting any new work on this project.**
This file is the persistent memory for coding agents. Update it after every meaningful change: what changed, which files, why, what's now working, what remains.

---

# Project Overview

ChurnGuard is a frontend prototype for an AI-powered customer retention intelligence platform for SaaS Customer Success teams. It was built as a capstone project (Manipal University Jaipur), but **all Deloitte / "Deloitte Capstone 2026" branding was removed from the product in session 10** at the user's request — landing hero badge, footer mark, auth-layout footer and the Executive View footer. ChurnGuard's own visual identity, including the green accent, deliberately stays. Do not reintroduce capstone or sponsor branding anywhere user-facing.

This repo (`PRT 1`) was created by copying a mature, mostly-complete existing implementation from a sibling folder (`C:\Users\Admin\Desktop\Antigravity_workspace`) per explicit user instruction, then extending it. That source folder is now considered historical — **all future work happens in this repo (`PRT 1`)**, not in `Antigravity_workspace`.

Reference documents that informed this build (not copied into the repo, live on Desktop):
- `Desktop/Deloitte Capstone/user_flow_diagram.md` — the original user flow (Landing → Login/Signup → Onboarding → Data Management → Dashboard → Customers → Customer Detail → Explainability → Recommendations → Outreach; Simulator and AI Assistant as side branches). **The two side branches were deliberately removed in session 5** — treat that part of the doc as historical.
- `Desktop/Deloitte Capstone/ChurnGuard_AI-Powered_Customer_Retention_Intelligence-*.pptx/.pdf` — capstone presentation (contains OUTDATED XGBoost references — do not use).
- `Desktop/Sifa/ChurnGuard_Master_Specification.docx`, `ChurnGuard_Product_Bible.pdf`, `ChurnGuard_Detailed_User_Journey_PRD.pdf` — product spec docs.
- `Desktop/Deloitte Capstone/Telco_customer_churn.xlsx` — the reference dataset (Telco churn, 7043 rows, 21 columns) that all mock data is modeled after.

# Product Goal

PREDICT → EXPLAIN → ACT. Help Customer Success teams: identify at-risk customers, understand *why* (SHAP-style explanation), decide what to do (recommended action), review an AI-drafted outreach email (human-approved, never auto-sent), and track outcomes. Risk Analytics covers aggregate retention performance; Executive View is the presentation-mode summary.

This is a **prototype**, but as of session 7 it is no longer a demo-data shell: predictions, SHAP values, risk scores, recommendations and outreach drafts all come from a real FastAPI + ML backend (`backend/`) trained on whatever dataset the user connects — see the session 7 changelog entry near the top of this file. What's still deliberately prototype-scoped: no database (one dataset in memory at a time), no backend user accounts (auth stays local/mock), no time-series history (a single upload is a snapshot).

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
│   ├── utils/theme.js           # NEW (s10) — THE appearance preference (light/dark/system)
│   ├── services/datasetHistory.js # NEW (s10) — IndexedDB dataset history + restore
│   ├── pages/HistoryPage.jsx    # NEW (s10) — saved datasets, "Use dataset"
│   ├── components/ui/ThemeToggle.jsx      # NEW (s10) — header appearance control
│   ├── components/data-setup/DataFlowRail.jsx # NEW (s10) — DATA→QUALITY→…→READY rail
│   └── utils/helpers.js         # cn(), formatters, risk color/label helpers, delay()
```

Note: `utils/csv.js` and `utils/spreadsheet.js` in the tree above are historical — both were deleted in session 7.

# Pages (routes)

Public: `/` (LandingPage), `/login`, `/signup`, `/forgot-password`.
Protected (behind `ProtectedRoute`, wrapped in `AppLayout` sidebar+header): `/data-management`, `/history` (NEW session 10), `/dashboard`, `/customers`, `/customers/:id`, `/analytics`, `/explainability`, `/recommendations`, `/outreach`, `/settings`, `/executive`.

**Removed 2026-09-06 (session 5):** `/ai-assistant`, `/simulator`, `/playbooks`, `/playbooks/new`. Those routes now fall through to `NotFoundPage`, which is the intended behaviour — they are gone from the product, not broken.

**Note on the AI assistant:** the *feature* came back in session 6, but the *route* did not. It lives only as a global floating widget — see "AI Assistant (floating widget)" below. Do not re-add `/ai-assistant` or a sidebar entry for it.

**Dataset-setup gate (added 2026-09-06).** Every protected route additionally requires `AppContext.datasetSetupComplete`, except the three listed in `src/routes/accessRules.js` (`SETUP_EXEMPT_PATHS` = `/data-management`, `/history`, `/settings`). `/history` is exempt on purpose — its whole job is to put a previously connected dataset back, which is exactly what a user without one needs. Authenticated users without a connected dataset are redirected to `/data-management`. `accessRules.js` is the single definition — `ProtectedRoute` and `AppLayout`'s sidebar both read it, so the nav can never offer a link the guard would bounce.
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
DATA         Data Management · History   <- first, because nothing else works without data
MONITOR      Overview · Customers · Risk Analytics
RETENTION    Explainability · Recommendations · Outreach
(pinned bottom)  Executive View · Settings
```

The first group was "DATA SETUP / Data Management" until session 10; History joined it (reconnecting a
previous dataset is the other half of the same job) and the label shortened to "Data".

- The Data Management entry carries a `Badge variant="medium"` reading **Required** until a dataset is connected, then a small accent check. Collapsed sidebar shows a dot instead. Screen readers get an `sr-only` "— setup required" / "— setup complete".
- `SidebarLink` is the single renderer for the desktop sidebar and the mobile drawer; `NavGroupLabel` renders the section headings (a divider when collapsed).
- Gated pages render as disabled entries with a lock icon while setup is incomplete — exempt paths come from `routes/accessRules.js`, so the nav and the route guard can never disagree.

# Components

Design system components in `src/components/ui/` were NOT modified except where noted. Reuse these for any new UI — do not create parallel one-off styled elements.

- **`ui/Tooltip.jsx`** (NEW, session 5) — **the** tooltip pattern; do not add another. `<Tooltip content>` wraps a trigger and opens on hover *and* focus; `<InfoTip content label>` is the info-icon affordance used next to metric titles, chart titles and table headers. It is a real `<button>`, so touch and keyboard users get the same content mouse users get. Rendered through a portal with fixed positioning (so table `overflow-x-auto` wrappers can't clip it), flips above/below based on available room, and closes on Escape.
- **`ui/ChartCard.jsx`** (NEW, session 5) — the standard frame for every chart: title + always-visible one-line description + info icon + built-in empty state. Pass `metricKey` to pull all three strings from `utils/glossary.js`. Used by Overview, Analytics, Customer Detail and Explainability.
- **`ui/MetricCard.jsx`** (extended, session 5) — gained `description` (visible supporting text) and `help` (tooltip detail). The trend arrow now also carries an `sr-only` "(improving)/(worsening)" so meaning isn't colour-only.
- **`src/components/data-setup/`** (2026-09-06) — the first-run data-onboarding flow, split out of `DataManagementPage` so no single file gets unwieldy. `steps.js` (the one definition of `SETUP_STEPS` and `PROCESSING_STAGES`), `SetupStepper.jsx` (5-column progress on `sm`+, compact "Step n of 5" bar below that), `UploadStep.jsx`, `ValidationStep.jsx`, `MappingStep.jsx`, `ProcessingStep.jsx`, `CompleteStep.jsx`. All built from the existing `ui/` primitives (Card, Button, Badge, Select) — no parallel design system. `DataManagementPage.jsx` is now purely the flow's state machine + service calls.

- **`ui/ThemeToggle.jsx`** (NEW, session 10) — the header appearance control. Cycles Light → Dark → System and writes `AppContext.theme`, the SAME state Settings → Appearance writes. Its `aria-label` always states the current mode and what pressing it does, so meaning never depends on recognising the icon. **Do not add a second theme control with its own state.**
- **`data-setup/DataFlowRail.jsx`** (NEW, session 10) — the constant DATA → QUALITY → PROCESSING → MODEL → READY map at the top of Data Management (`PipelineProgress` is the live narration during a run; this is the map around it). Below `sm` it collapses to "Step n of 5" plus the current stage rather than side-scrolling. **Its `<li>` carries `relative` for a real reason:** the `sr-only` position markers inside are absolutely positioned, and without a positioned ancestor they escape every `overflow` container and widen the whole page at 390px (that was a real, measured overflow bug).
- **`data-setup/CompleteStep.jsx`** (rewritten, session 10) — no longer a "you're done" screen but the connected-dataset control centre: provenance, measured facts, which of the user's columns fill which ChurnGuard field, what cleaning ran, and the model's training metrics. Reads only `AppContext.activeDataset`, so opening Data Management with a dataset connected makes **zero API calls**.
- **`ModelArchitecture.jsx`** (NEW, `src/components/`) — collapsible panel showing the 10-stage ML pipeline (Data → Cleaning → Leakage Removal → Scaling → PSO/ACO → TabNet → SHAP → Stacking Ensemble → FastAPI → Dashboard). Includes an explicit disclaimer that this is conceptual and predictions elsewhere in the app are demo data. Embedded in `ExplainabilityPage` (below the AI explanation) and in `DataManagementPage` (during the "Processing" step, `defaultOpen`).
- **`Hero3DBackground.jsx`** (NEW, `src/components/`, 2026-09-03) — decorative React Three Fiber scene for the landing page hero: ~40 small spheres colored by the same risk palette used elsewhere (mostly accent/green, a few amber/orange/red), loosely connected by thin lines, slowly rotating. Represents "many customers being watched, a few drifting into risk" without being literal — see spec section 10/11 ("Risk intelligence visualization", "floating customer/risk nodes"). Lazy-loaded from `LandingPage.jsx` via `React.lazy`/`Suspense fallback={null}` so it never delays the hero text/CTA's first paint. **Skips rendering entirely** (returns `null`) on `prefers-reduced-motion: reduce` or viewport width < 768px — verified via Playwright (`canvas` element count is 0 in both cases). Non-interactive: `pointer-events-none`, no orbit controls; verified the hero CTAs are still clickable through it.
  - **Placement is mask-driven, not position-driven**: the wrapping div's `mask-image` is an inverted radial gradient — `transparent` in the center ~40% (where the headline/subtitle/buttons live) fading to fully visible by ~78% radius. This keeps every node/line out of the readable text area while still framing the hero at the edges/corners. **If you ever see nodes overlapping the headline text again, the mask direction was likely flipped by mistake** — `transparent` = hidden, `black` = visible, and the *center* stop must be `transparent`.
  - Bundle note: the lazy chunk is ~230KB gzipped, almost entirely `three.js` core pulled in by `@react-three/fiber`'s `<Canvas>` — this doesn't meaningfully tree-shake regardless of import style (tried named imports from `three` instead of `import * as THREE`; no change). Accepted tradeoff since it's lazy, desktop-only, and loads after first paint. Don't try to chase this further without a real reason (e.g. don't add postprocessing/bloom libraries on top of it).

# Services (`src/services/api.js`)

Single service layer, already existed and is well-structured — extended, not replaced. **As of session 7, `VITE_USE_MOCK_API` no longer exists.** `dashboardService`, `customerService`, `explainabilityService`, `recommendationService`, `outreachService` and `datasetService` always call the real backend via the shared `apiClient` (axios, `baseURL` = `VITE_API_BASE_URL`, default `http://localhost:8000/api`). Only `authService` stays local/mock (no backend user accounts exist), and `chatService`/`notificationService` stay local/demo (unrelated features — see their own sections below).

Current: `authService`, `dashboardService`, `customerService`, `explainabilityService`, `recommendationService`, `outreachService`, `datasetService`, `chatService`, `notificationService`.

**Removed session 5:** `playbookService` and `simulatorService` — dead once Playbooks and the Simulator were removed.

**`chatService`** was removed in session 5 and **restored in session 6** along with `getDemoChatResponse`, `VITE_USE_LIVE_ASSISTANT` and `VITE_ASSISTANT_API_URL`. It now serves only the floating widget.

**Changed 2026-09-06 — `datasetService` now analyses the real file.** Its mock branch used to return hardcoded Telco statistics (7043 rows, 21 columns, 92% health) regardless of what the user uploaded. It now parses the actual CSV in the browser (`src/utils/csv.js`) and reports measured figures: row/column counts, per-column type + distinct + missing counts, total missing cells, exact duplicate rows, a real first-5-rows preview, and auto-suggested column mappings. The parsed dataset is held in a module-level `uploadedDatasets` Map between `uploadDataset` → `validateDataset` → `mapColumns` → `runPrediction` (same in-memory-store pattern as `playbooksStore`; resets on reload). Also exports `DATASET_UPLOAD` (the real upload limits, so the UI can state them accurately) and `DatasetError` (carries `message` + `hint` so the UI can say what's wrong *and* what to do). **The invented "dataset health %" was removed** — it was a made-up score; the UI now shows only measured facts. Real-backend branches are unchanged.

**`src/services/datasetHistory.js` (NEW, session 10) — browser persistence, not a second API layer.** `services/api.js` is still the only thing that talks to the backend; this module talks to IndexedDB. It stores dataset metadata plus the original file as a Blob, so a previously connected dataset can be handed straight back to the *existing* `datasetService` upload → validate → map → predict pipeline. Key points:

- **One canonical record**: `{ id, userKey, name, sourceKind, provider, sourceDetail, rowCount, columnCount, requiredFieldCount, requiredTotal, mappedFields, createdAt, lastUsedAt, status, unavailableReason, fingerprint, file }`. No customer records, scores, dashboards or model output — those belong to the active dataset and would be stale copies.
- **De-duplication** is by `fingerprint` (userKey + sourceKind + name + rows + columns), so reconnecting the same dataset updates its entry instead of stacking rows. History is capped at 25 entries per user, oldest-used trimmed.
- **Honest limits**: files over 25MB and CRM imports are stored as `metadata-only` with an `unavailableReason` the UI prints. If IndexedDB is missing or blocked, every call rejects with `HistoryUnavailableError` and the page says so — it never silently pretends to save.
- **Testability**: the store is `createHistoryStore(driver)` over a three-method driver (`getAll`/`put`/`remove`); the IndexedDB driver is one implementation, and `datasetHistory.test.js` exercises the record semantics against an in-memory one. **Don't inline IndexedDB calls into components** — that contract is why the behaviour is testable at all.

# API Routes (real, as of session 7)

Implemented in `backend/api/dataset_routes.py`, mounted under `/api` in `backend/api/main.py`: `GET /dashboard*`, `GET /customers`, `GET /customers/:id`, `GET /customers/:id/explanation`, `GET /customers/:id/recommendations`, `PUT /recommendations/:id`, `POST /customers/:id/outreach/generate`, `GET/PUT /outreach*`, `POST /datasets/upload|validate|map-columns|predict`. `POST /auth/*`, `POST /chat` and the old Playbooks/Simulator routes were never implemented and are not needed — auth stays local/mock and chat/simulator don't exist as features any more (see below).

# Mock Data (`src/mock/`)

**As of session 7:** `datasetSchema.js`, `demoDataset.js`, `notifications.js`, `users.js`. `customers.js`, `dashboard.js`, `explainability.js`, `recommendations.js` and `outreach.js` were **deleted** — they held a fixed 20-account SaaS-company mock that has no relationship to whatever dataset a user actually connects; that data now comes from the real backend (see the session 7 changelog entry). Do not scatter new mock data into components — for the two files that remain relevant to real data flow (`datasetSchema.js`, `demoDataset.js`), add to this directory and wire through `services/api.js`; the rest live only for `authService`/`chatService`/`notificationService`, which stay local/demo by design. **(Session 10b)** `notifications.js` was rewritten: its entries and the assistant's canned replies used to name customers and companies from the deleted 20-account mock and linked to `/customers/CUST-100x`, which 404s. Both now avoid invented specifics and link only to routes that exist, and the panel says it is sample content.

- `datasetSchema.js` — `CHURNGUARD_FIELDS`, the canonical list of fields a customer dataset maps onto (5 required: Customer ID, Tenure, Monthly charges, Contract type, Churn label; 3 optional: Total charges, Service/product tier, Payment method), each with a plain-language description, an example, and name aliases used for auto-matching. **This is the one definition on the frontend** — mirrored server-side in `backend/api/schema.py` (kept in sync by hand; it's a small, stable list). The "Before you upload" requirements list, the validation report's required-field check, and the mapping UI all read the frontend copy. Don't restate these fields anywhere else.
- `demoDataset.js` — builds a *real* 302-row Telco-shaped CSV (deterministic seeded PRNG, so it's byte-identical every run) including a few blank `TotalCharges` and two exact duplicate rows. Uploading it now runs through the real backend and trains a real (if small-sample) model — "Use demo dataset" is a genuine end-to-end path, not a canned response.

# Demo Behavior

- **One-click demo entry**: Landing page "Explore Demo" button → `/login?demo=true`. `LoginPage` detects `?demo=true` and auto-submits the pre-filled demo credentials (`demo@churnguard.ai` / `demo2026`) on mount, landing on **`/data-management`** (changed 2026-09-06 — was `/dashboard`). From there "Use demo dataset" reaches the Overview in three more clicks, no CSV needed.
- **Use demo dataset**: `/data-management` step 1 offers it beside the real upload — builds a genuine CSV (`mock/demoDataset.js`) and runs it through the exact same upload → validate → map → process → predict pipeline as a real upload, so there's only one code path to maintain.
- **Demo mode indicator**: `AppContext.demoMode` (currently hardcoded `true`) shows a "DEMO" badge in the header/sidebar.
- Any mock/simulated result in the UI is explicitly labeled as such (outreach drafts state that they are a starting point for human review; Explainability's written summary says it is a demo write-up, not live model output; the data-setup completion screen distinguishes measured facts from simulated scores; `ModelArchitecture` says predictions are demo data).

# Dataset Ingestion — CSV / XLSX / XLS

**(Changed session 7 — moved server-side.)** File parsing used to happen client-side (`utils/spreadsheet.js` + `utils/csv.js`, both deleted session 7, SheetJS-based). It's now `backend/generic/io_utils.load_dataset_from_bytes()` — pandas' `read_csv`/`read_excel`, which natively handles `.csv`/`.xlsx`/`.xls` without a SheetJS-style security caveat (Known Issues #4 below is now historical — the library it warned about is gone from the repo). The frontend's `DATASET_UPLOAD.extensions` in `services/api.js` is now a plain hardcoded list (`['.csv', '.xlsx', '.xls']`) instead of being derived from a parser module, since the parser is no longer client-side; keep it in sync with `io_utils.py` by hand if that ever changes.

# Metric Glossary (`utils/glossary.js`)

**One definition per metric, shared by every page that shows it.** Explaining "Revenue at Risk" one way on the Overview and differently on the Executive View is exactly the redundancy this file prevents. Each entry has:

- `label` — the visible name
- `description` — the short line shown under the value (visible, never hover-only)
- `help` — the extra detail behind the info icon; one or two sentences

Consumed by `MetricCard`, `ChartCard`, the Customers table headers, Customer Detail, Explainability and Recommendations. **If a metric needs describing, add it here and import it — don't write the copy inline.**

Everything in it must match the implementation: the risk-tier cut-offs quoted in `riskTier` come from `getRiskTier()` in `utils/helpers.js` (Low <35, Medium 35–59, High 60–79, Critical 80+), and the demo-data caveats are real.

# Appearance / theming (session 10)

**One setting, one owner.** `AppContext.theme` holds the preference (`light` | `dark` | `system`); `AppContext.resolvedTheme` is what is actually rendered. Both the header control (`ui/ThemeToggle`) and Settings → Appearance call the same `setTheme`. There is deliberately no `headerTheme`/`settingsTheme` split.

- `utils/theme.js` is the only module that reads/writes the `churnguard_theme` key, and `AppContext` is its only caller. The **one documented exception** is the small inline script in `index.html`, which reads the same key before first paint so a light-theme user never sees a dark flash. If you rename `THEME_STORAGE_KEY`, change that script too.
- The resolved theme is written to `<html data-theme="…">`. `src/index.css` declares the **complete colour-token set** for `[data-theme='dark']` and `[data-theme='light']` inside `@layer base` (base beats `@theme`'s `:root` in Tailwind v4's layer order). The selector is an attribute selector, not `:root`, so a subtree can pin itself — **`LandingPage` sets `data-theme="dark"` on its own wrapper** because its copy, gradients and 3D hero are written for a dark ground.
- Light is not "dark with the background flipped": the accent and every risk colour are darkened (`#86BC25` → `#4F7A14`, `#4ADE80` → `#15803D`, …) because the dark values are unreadable on a pale surface. `getRiskColor()` in `utils/helpers.js` now resolves those from the CSS tokens (cached per theme — `getComputedStyle` forces a style recalc and it runs inside chart render loops) instead of returning hardcoded hex.
- `--color-success` / `--color-danger` were **added** to `@theme` in session 10: `text-success`, `bg-danger/5` etc. were already used by `PipelineProgress` and `CompleteStep` but had never been declared, so they generated no CSS at all and silently inherited the surrounding colour.
- `system` keeps following the OS after load via a `matchMedia` listener in `AppProvider`.

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
- The completion screen's "already churned" count is read out of the mapped churn column — a fact, not a prediction. **(Session 7)** risk scores elsewhere in the app are no longer simulated — a real model is trained per upload, and the completion screen states this and shows real `trainingMetrics` (accuracy/precision/recall/ROC-AUC).
- **Uploads are CSV, XLSX and XLS**, parsed server-side since session 7 (see "Dataset Ingestion" below). The UI's format list renders from `DATASET_UPLOAD.extensions` in `services/api.js` — keep it matching what `backend/generic/io_utils.py` actually reads.
- Processing stages are paced (~550ms each between backend calls) so the user can read them, but the predictions stage now waits on genuine training — it takes noticeably longer than the other stages, which is correct: a model is actually being trained, not simulated.

# Completed Features (as of 2026-09-07, session 6)

Everything in the product's core journey works end-to-end and was verified in a real headless-Chromium run (Playwright), not just by reading code:
Landing (with 3D risk-node hero background) → Explore Demo (one-click) → **Data Setup (required: upload CSV/XLSX/XLS or the demo dataset → validate → map columns → process → predictions)** → Overview → Customers → Customer Detail → Explainability → Recommendations → Outreach (AI draft, human-approve) → Risk Analytics → Executive View → Settings → Onboarding (post-signup, feeds into Data Setup). The AI assistant is available throughout as a floating bottom-right widget.

No XGBoost anywhere. No secrets in the repo (`.env` is gitignored; the only key the project ever held, `XAI_API_KEY`, went away with the AI Assistant).

# Current Development State

Stable as of session 10. `npm run build` and `npm run lint` (**56 warnings**; the only delta from session 8's 55 is one more instance of the pre-existing `react(only-export-components)` on `routes/index.jsx`, produced by registering the `/history` route — none of session 10's new files warn) pass. `npm run test` is **32 tests, 5 files** (`Badge`, `Button`, plus session 10's `datasetHistory.test.js` (15), `utils/theme.test.js` (7) and `CustomersPage.test.jsx` (4)). Historical note: it was **6 tests, 2 files** after session 7 — down from 39/4 after session 7 deleted `csv.test.js` (21 tests) and `spreadsheet.test.js` (11 tests) along with the now-dead client-side parsing code they tested; not a regression, the code under test no longer exists. Lint warnings are pre-existing and unrelated to session 7's changes (no new warnings introduced — verified by running lint before and after). If you add exported constants next to a component, oxlint's `react(only-export-components)` will flag it — put them in a plain `.js` module instead (that's why `components/data-setup/steps.js` exists).

**Backend (`backend/`) has no automated test suite** — session 7 verified it with a live end-to-end HTTP run (upload → train → predict → dashboard → customers → explain → recommend → outreach) rather than pytest. Adding real backend tests (at least around `dataset_routes.py`'s orchestration and `profiling.py`'s validation logic, which are pure-ish and don't need a trained model) would be a good next step.

# Pending Work

- **Recharts bundle size** — `npm run build` warns about a >500kB chunk (`index-*.js`, mostly Recharts + core). Pre-existing, not addressed — would need route-level chart code-splitting if it becomes a real problem.
- **`date-fns` and `@react-three/drei` are still installed and unused.** Both were already dead before session 5 and are unrelated to anything removed there, so they were left alone rather than widening the change. Safe to drop in a dedicated dependency pass.
- Onboarding data (company/industry/goals) is collected but not persisted anywhere (no backend, no localStorage) — purely a UX flow demonstration. If a future agent wants it to "stick," it should go through `AppContext` (which now has the pattern for exactly this — see the dataset-setup record) or a new mock service, not ad-hoc localStorage.
- **(Resolved session 7, noted for history)** Uploaded files used to be parsed on the frontend main thread (`utils/csv.js`/`utils/spreadsheet.js`, both deleted session 7). Parsing now happens server-side (`backend/generic/io_utils.py`, pandas) as part of upload — a large file blocks that one request, not the browser tab. If a very large upload ever needs progress feedback beyond the existing upload-progress bar, that's a backend streaming concern now, not a Web Worker one.
- **(Partly resolved session 10) Settings is mostly still a UI shell.** **Appearance is now real** — it writes `AppContext.theme`, applies instantly and persists (see "Appearance" below). The **Data source and Data preferences tabs were removed entirely** (data belongs to Data Management and History). Profile / Organization / Notifications / Security still collect values and toast "saved" without persisting; Profile and Security both offer Sign out, wired to the one `AuthContext.logout`. If the rest should stick, route them through `AppContext` the way the dataset-setup record and the theme do.
- **(Resolved session 8)** The browser click-through session 7 could not do was done in session 8 (33/33 golden-path + 11/11 exception-path checks in headless Chromium against real servers), and it found three real UI bugs — see session 8's changelog entry.
- **Salesforce connector is scaffolded only** — it needs a registered OAuth connected app before it can reach a real org, and refuses with an explanation until then. HubSpot and the generic HTTP endpoint really connect. **HubSpot's success path has not been exercised against a live account** (no token available in this environment); only its failure path was verified against the real API.
- **Dataset setup state is split** — the unlock record is per-browser `localStorage` (`churnguard_dataset_setup`), the dataset itself is in backend process memory. A different browser hitting a backend that already holds a trained dataset is sent back through setup. **Session 10 mitigates the user-visible half of this**: the file is kept in IndexedDB, so "send me back through setup" is now one click in History instead of finding the export again. It is a mitigation, not a fix — the record and the file are still per-browser, and reconnecting genuinely retrains. A real deployment still needs server-side session state.
- **(Resolved session 7)** The dataset the user connects now drives the entire app — see the session 7 changelog entry. The one remaining gap: no browser click-through verification was done for this change (no browser-automation tool was available); do that before trusting the UI layer as deeply as prior sessions' Playwright-verified work.

# Known Issues

1. **(Fixed 2026-09-03, documented so it isn't reintroduced)** `src/index.css` had an **unlayered** global reset (`* { margin:0; padding:0; box-sizing:border-box }` directly in the stylesheet, not inside `@layer base`). Under Tailwind v4's CSS Cascade Layers, unlayered rules beat ALL layered rules (including every Tailwind utility) regardless of specificity — this silently zeroed out `margin-left`/`margin-right`/etc. utilities app-wide, which broke the sidebar's `lg:ml-60`/`lg:ml-16` content offset on **every single authenticated page** (content rendered underneath the fixed sidebar, clipped). Fixed by wrapping the reset in `@layer base { ... }`. **Rule for future CSS edits in this file: any new global/reset-style rule (bare element or `*` selectors) MUST go inside `@layer base { }`, or it will silently override Tailwind utilities again.** Verified fixed via computed-style inspection (`margin-left` now correctly resolves to `240px`) and a full Playwright run through every major page.
2. Duplicate React key warning in `DataManagementPage`'s column-mapping `<Select>` (the current-value option duplicated one of the fixed target options) — fixed 2026-09-03 by deduplicating the options list.
3. **`npm audit` reports moderate advisories in `qs` (via `express`)** with no working fix — `npm audit fix` does not resolve them. These went away in session 5 when `server.js` was deleted and came back in session 6 when the AI assistant widget (and its optional Grok proxy) were restored. Real-world risk here is negligible: `server.js` runs locally only, is never deployed, is opt-in via `VITE_USE_LIVE_ASSISTANT`, and exposes a single JSON POST route with no query-string parsing. Re-check when a patched `express` ships. If the live-Grok path is ever dropped for good, deleting `server.js` + `express` + `dotenv` clears it again.
4. **(Fully resolved session 8 — the package itself is now uninstalled.)** Session 7 deleted the code that used it but left `xlsx` in `package.json`, so the advisory still applied to the installed tree; session 8 ran `npm uninstall xlsx` (nothing imports it), taking `npm audit` from 1 high + 3 moderate to 3 moderate. `xlsx` (SheetJS) had a high-severity advisory with no npm fix, used for client-side XLSX/XLS parsing since session 5. Session 7 moved all file parsing server-side (pandas, in `backend/generic/io_utils.py`) and deleted `utils/spreadsheet.js`, so this advisory no longer applies to the frontend. Left below for history:
   - The advisories are CVE-2023-30533 (prototype pollution) and a ReDoS, both triggered by parsing a **maliciously crafted spreadsheet**. Fixed upstream in SheetJS 0.19.3+/0.20.2+, but SheetJS left npm at 0.18.5, so `npm audit fix` cannot resolve it.
   - Risk here is contained: the file is the user's own, it is parsed entirely client-side in their own browser, and nothing is transmitted anywhere. The worst case is a corrupted or hung tab for the person who chose the file — there is no server and no other user's data to reach.
   - Alternatives were considered and rejected: `read-excel-file` and `exceljs` cannot read legacy `.xls` (so they'd fail the requirement), and `@e965/xlsx` — an unofficial republish of the patched 0.20.3 — trades a known advisory for unvetted supply-chain risk.
   - **If this ever handles untrusted uploads or moves to production, switch to the official SheetJS CDN build (`https://cdn.sheetjs.com/xlsx-0.20.x/`) — that is the supported upgrade path.** Only `utils/spreadsheet.js` imports it, so it is a one-file change.
5. **`README.md` still contains unresolved merge-conflict markers** (`<<<<<<< HEAD` at line 1, `=======` at line 80, `>>>>>>> 684a4db` at line 108), despite commit `2d1bfaf` "Resolve merge conflict in README.md". Found 2026-09-06; left alone as out of scope for that session's task, but it should be resolved — the file currently documents the project twice. Note the HEAD half also has stale facts (says React 18 / Tailwind v3 / Router v6; the app is React 19 / Tailwind v4 / Router v7).
6. **(Resolved session 7)** `backend/` is now wired to the frontend via `backend/api/dataset_routes.py`, mounted under `/api`. The old `/generic/train|predict|explain` routes (`generic_routes.py`) are unrelated and unused by the frontend — left in place, not removed, since they're harmless and someone may still want the raw generic-pipeline API for scripting.
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

- The backend is **FastAPI**, base URL configured via `VITE_API_BASE_URL` (default `http://localhost:8000/api`), implemented in `backend/api/dataset_routes.py` and mounted in `backend/api/main.py`. This is no longer hypothetical — see the session 7 changelog entry and "Running the real backend" in `DEVELOPMENT.md`.
- Auth stores a bearer token in `localStorage` (`churnguard_token`) against a **local/mock** `authService` — there is no backend user-account system. Fine for a prototype; would need real auth (and moving off `localStorage` to httpOnly cookies) for production use.

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

**Route chunk sizes (session 10, `npm run build`).** Data Management was 66.27 kB (20.17 kB gzip) because the upload dropzone, CRM connect form, review screen, blocked-data screen and the demo-dataset generator were all statically imported — none of which a returning user with a connected dataset needs. They are now `React.lazy`/dynamic `import()`, taking the route to **29.53 kB (9.15 kB gzip)**, with `UploadStep` (32 kB, mostly react-dropzone), `CrmConnectStep` (8 kB), `ReviewStep` (5.9 kB), `IssueList` (2.6 kB) and `demoDataset` (1.5 kB) fetched only when actually needed. The new History route is 10.95 kB (3.94 kB gzip) and deliberately pulls in **no chart library**. The shared `index` chunk grew ~5.5 kB for the theme system and the History nav entry.

**Don't put `MetricCard` on Data Management** — it imports Recharts, which would drag the whole chart bundle into a route that shows no charts. Use the local `Stat`/`SectionTitle` pattern in `CompleteStep` instead.

`checkBackendHealth()` caches its answer for 30s (`force: true` bypasses it, which is what "Check again" passes). Data Management mounts `BackendNotice` on every visit, and React StrictMode double-invokes effects in dev, so this removes a duplicate `/api/health` request per visit.

**Important measurement caveat:** headless Chromium renders WebGL in software (SwiftShader), so any headless FPS number for the 3D canvas is far worse than reality. To judge the 3D honestly, run Playwright with `headless: false` and `--enable-gpu` (on this machine that reports `ANGLE (Intel UHD Graphics …)` and gives ~56–58fps).

# Changelog

**2026-09-08 (session 10b)** — Bug-fix pass over the whole app: every route swept in both themes, every control audited for an accessible name, and the leftovers of the deleted mock data removed from the notification panel and the assistant.

*Why:* the user asked for the remaining bugs to be resolved. This was a hunt, not a feature session — a scripted sweep of all 10 authenticated routes at 390/820/1440px in dark and light, an accessible-name audit of every button and link, plus the paths a click-through misses (two datasets in History, deletion, refresh, bad uploads, a second account, CRM, backend down).

**Bugs found and fixed**

1. **The Cmd+K search palette ignored Escape.** It printed an "ESC" hint but had no key handler, and its backdrop covers the entire app — so a keyboard user who opened it was left with an overlay swallowing every click. `SearchCommand` now closes on Escape and carries `role="dialog"`/`aria-modal`.
2. **The notification panel ignored Escape** for the same reason (its only dismissal was clicking an invisible backdrop). Fixed the same way, plus `role="dialog"` and an `aria-hidden` backdrop.
3. **The floating assistant launcher had no accessible name** — an icon-only button announced as just "button". It now has a state-dependent `aria-label` and `aria-expanded`.
4. **Six more nameless icon-only controls**: the mobile header's menu / search / bell, the mobile drawer's close button, and (below `xl`, where its text label is hidden) the desktop account button. All labelled; the bell's label includes the unread count.
5. **Pagination was unusable by screen reader** — bare chevrons and bare page numbers, with the current page marked by colour alone. Now `<nav aria-label="Pagination">` with "Previous page" / "Next page" / "Page n" and `aria-current="page"`.
6. **Toasts sat on top of the assistant launcher** (both bottom-right), and at 390px a toast could be wider than the viewport. Moved above the launcher (`bottom-24`) and capped at `calc(100vw-2rem)`; the container is also a real `role="status"` live region now.
7. **The notification panel described a customer base that no longer exists.** Its entries named "Acme Technologies", "DataSphere Solutions", "Zenith Healthcare" and "Dr. Ahmed Hassan", quoted "7,043 rows" and "342 high risk", and **two of them linked to `/customers/CUST-1001` and `/customers/CUST-1005`, which land on the not-found state** — all leftovers of the 20-account mock session 7 deleted. Rewritten with no invented customers, companies or figures, links only to routes that exist, and a visible "Sample notifications — ChurnGuard has no alerting backend yet" line so nothing reads as real activity.
8. **The assistant's canned replies had the same problem** — "DataSphere Solutions — 88.1%", drivers like "Login Frequency Drop" that are not fields in the current schema, and the same dead `/customers/CUST-1005` link. They now point at the page that computes the user's real answer (Customers filtered to Critical, Explainability, Risk Analytics) instead of inventing one. This also retires the raw-markdown-table rendering wart noted in the AI Assistant section.
9. **`demoMode` was hardcoded `true`, so a user who uploaded their own customer export was told they were looking at demo data.** That is exactly the mislabelling `DataSourceBadge` exists to prevent, in the other direction. It is now derived from `activeDataset` (`source.kind === 'demo'`), the badge reads "DEMO DATA", and it does not appear at all before a dataset is connected or for a real upload.

**Verified in headless Chromium (real servers)**

- **Full sweep, 0 problems**: all 10 authenticated routes rendered in dark at 1440/820/390px and light at 1440/390px — no empty pages, no horizontal overflow, no console errors, no page errors, no failed or 5xx requests.
- **Accessible-name audit, 0 findings** across those routes plus the landing page: every `button` and `a[href]` now has a name.
- **History guarantees**: two datasets listed newest-first with their own measured row counts (140 vs 302), only one marked Active, switching back to the older one re-ran the pipeline and the dashboard followed it (300 customers), no duplicate entries, delete removed the row **and** left no orphan in IndexedDB, and a second account saw none of the first account's datasets.
- **Gate and errors**: refresh on `/dashboard` and `/history` stays put; a new account is bounced to Data Management but can still reach `/history`; a `.pdf` is refused with "That file type isn't supported. Upload CSV, XLSX, XLS."; an empty file with "That file is empty…"; neither unlocks the app or is written to History; with the API blocked the app warns before a file is picked, names the uvicorn command, does not blame the user's data, and History still works because it is local.
- **CRM branch** (now a lazy chunk) loads, lists providers with honest Available/Coming soon status, and returns cleanly to the source choice.
- Interaction: notifications open and close by Escape with the backdrop gone (header immediately clickable again), the assistant opens and closes, the theme survives navigation across four routes, sign out returns to `/login` and re-locks protected routes.
- The two session-10 suites were re-run unchanged: **64/64 golden-path and 13/13 edge-case checks still pass.**
- `npm run build`, `npm run test` (32/32) and `npm run lint` (56 warnings, 0 errors — unchanged) all pass.

**Not changed, deliberately**

- `OutreachPage`'s `react(immutability)` warning (`loadEmails` read in an effect declared above it) is a lint smell, not a runtime bug — the effect body runs after the const is initialised. Left for a dedicated lint pass.
- The notification panel is still local sample content; it is now labelled as such rather than removed, because there is no alerting backend to replace it with.


**2026-09-08 (session 10)** — Dataset History (reuse a dataset without re-uploading it), Data Management rebuilt as a data control centre, a real Appearance setting, and the capstone/marketing branding removed.

*Why:* the backend holds one dataset in process memory and the unlock record is per-browser, so every fresh session meant hunting down the same export and uploading it again. Data Management itself was a working but sparse upload screen that said little about the data it had just ingested. Appearance existed in Settings but did nothing, Settings still carried two data-configuration tabs that belonged elsewhere, and the landing page carried capstone branding and an unsupported compliance claim.

**Dataset history (the re-upload problem)**

- **new `src/services/datasetHistory.js`** — IndexedDB-backed history: one canonical record per dataset (metadata + the original file as a Blob), user-scoped, de-duplicated by fingerprint, capped at 25 entries. Large files (>25MB) and CRM imports are stored `metadata-only` with a reason the UI prints. See the Services section above for the record shape and the driver contract. **localStorage is never used for dataset content.**
- **new `src/pages/HistoryPage.jsx`** + route `/history` (+ `SETUP_EXEMPT_PATHS`, + sidebar entry in the renamed "Data" group). Shows saved datasets with rows/columns/required fields/last used, marks the active one, and offers Use dataset / View details / Delete (confirmed in a `Modal`, with an extra warning when the entry belongs to the dataset currently in use — deleting the saved copy never disconnects the live dataset).
- **"Use dataset" reuses the existing pipeline, it does not add one.** It navigates to `/data-management?restore=<id>`; the page rebuilds a `File` from the stored Blob and runs the *same* `runUpload` → validate → map → predict path as a normal upload. The user never opens a file picker; the backend genuinely re-registers and retrains, and the UI says so rather than implying a previous model survived.
- Recovery is explicit: a missing/unreadable saved file shows "Saved dataset is no longer available in this browser. Please reconnect the original file." with a route back; a browser with no IndexedDB gets a plain explanation on History and setup still works normally.

**Data Management**

- `DataManagementPage.jsx` header renders immediately and never waits on data; **new `components/data-setup/DataFlowRail.jsx`** shows DATA → QUALITY → PROCESSING → MODEL → READY (compact "Step n of 5" below `sm`).
- `CompleteStep.jsx` rewritten into the connected-dataset control centre: provenance + status, measured facts (rows, columns, required/optional fields, empty values, duplicates, past churn examples, customers scored), **"What ChurnGuard is using"** (each ChurnGuard field ← the user's column, plus the columns left alone), the cleaning that actually ran, and the training metrics clearly labelled as *model* metrics. Every value comes from the connected dataset or the training run; nothing is invented, and Overview's portfolio KPIs are deliberately not repeated.
- `SourceSelector` gained a short "why this is needed" panel and a shortcut into History.
- **Performance:** `UploadStep`, `CrmConnectStep`, `ReviewStep`, `IssueList` are lazy; `mock/demoDataset` is a dynamic import; the completed view makes zero API calls (it reads `AppContext`); `checkBackendHealth()` is cached for 30s. Route chunk **66.27 kB → 29.53 kB** (20.17 → 9.15 kB gzip). No new chart/3D code on this route.

**Appearance**

- **new `src/utils/theme.js`** + `AppContext.theme`/`resolvedTheme`/`setTheme`, **new `ui/ThemeToggle.jsx`** in the desktop, mobile and presentation headers, and a working Settings → Appearance select. One state, two controls. Full light/dark token sets in `index.css`; pre-paint bootstrap in `index.html` avoids a flash. See the Appearance section above.
- `getRiskColor()` resolves risk colours from the CSS tokens (cached per theme); `RiskBadge`'s dot uses `currentColor`; the four outreach-status `Badge` variants moved off fixed Tailwind palette colours onto themed tokens; `--color-success`/`--color-danger` were declared for the first time.

**Customers, Settings, branding**

- Customers' Actions column (brain → Explainability, envelope → Outreach, both carrying the real customer id) gained the shared `Tooltip` on hover *and* keyboard focus, accessible labels ("View explainability for X" / "Create outreach for X"), accent hover and a visible focus ring, plus an `InfoTip` on the column header. No new pages, no new actions — PREDICT → EXPLAIN → ACT.
- Settings: **Data source and Data preferences tabs removed** (no empty tab, no orphaned state); Profile gained a Sign out section calling the same `AuthContext.logout` Security already used — there is still exactly one logout path.
- Removed "SOC 2 Compliant (Pending)" (not replaced with another claim), the hero "Deloitte Capstone 2026" badge, the footer capstone mark, and the footer's Platform/Pricing links. The footer's four `href="#"` placeholders became four real links (Features / How It Works / Security / Sign In). Deloitte references also removed from `AuthLayout` and `ExecutiveOverviewPage`. ChurnGuard's green identity is untouched.
- `Modal` gained `role="dialog"`/`aria-modal`.

**Bugs found and fixed**

1. **The connected dataset was recorded under its backend id, not its filename.** `process()` read `dataset?.filename` from state that `analyse()` had set in the same tick, so the closure always saw `null` and fell back to `report.datasetId` — every completion stored `filename: "DS-1788…"`. Pre-existing (the source line dates to session 8); it only became visible because History displays that name. Fixed with a ref (`connectedDataset`), which also removed a pointless re-render. **This also made every restore create a duplicate history entry**, since the fingerprint includes the name.
2. **`sr-only` markers widened the page at 390px.** `DataFlowRail`'s absolutely-positioned `sr-only` spans had no positioned ancestor, so they escaped both the rail's `overflow-x-auto` and `main`'s `overflow-x-hidden` and pushed `documentElement.scrollWidth` to 521px. Fixed with `relative` on the `<li>` (and the sub-`sm` layout no longer scrolls at all).
3. **`text-success` / `text-danger` / `bg-danger/5` generated no CSS** — used since session 8, never declared. Now real tokens.

**Tested**

- **Browser (headless Chromium, both servers real): 64/64 golden-path checks + 13/13 edge-case checks.** Covering: branding gone from the landing page and footer; demo upload through the real pipeline; the new completed view's measured facts, column usage and training metrics; History listing, active marking, details, delete confirmation (including the active-dataset warning); **replace → "Use dataset" → fully restored with no file picker, and no duplicate history entry**; header theme control ↔ Settings showing one state, persisting across reload; Customers' brain/envelope reaching Explainability/Outreach with the right id and the tooltip opening on keyboard focus; Settings Data tabs gone; Profile sign out (by keyboard) returning to `/login` and re-locking protected routes; IndexedDB disabled → honest message and setup still completes; `?restore=` with a missing record → the exact recovery message. **No horizontal overflow at 390 / 820 / 1440 px on `/data-management`, `/history`, `/customers`, `/settings`, `/dashboard`.** No console or page errors.
- `npm run build` (passes; the >500 kB warning is the pre-existing Hero3D/Recharts one), `npm run test` (**32/32, 5 files** — 26 of them new), `npm run lint` (56 warnings; the single delta is one more pre-existing-pattern warning in `routes/index.jsx` for the new route — no new file warns).
- Audits: no XGBoost in `src/`, `backend/`, `package.json`, `index.html` (the one binary match is `[xgboost_dart_mode: 0]` inside a **LightGBM** model dump — a LightGBM parameter name, not a dependency); no Deloitte/Capstone/SOC 2 strings anywhere user-facing; no second state library; no `axios`/`fetch` outside `services/api.js`; one metric glossary; one theme state; one history store.

**Limitations after this session**

- History is per-browser and per-user-key. Clearing site data or switching browser/device loses it, and the page says so plainly.
- A CRM-sourced dataset can be listed but not replayed (credentials are deliberately never stored), so it is saved as metadata-only.
- Restoring retrains — it is not instant, and on a large dataset it takes as long as the original run did.
- Settings' Profile / Organization / Notifications / Security still don't persist.


**2026-09-08 (session 9)** — Diagnostic pass: confirmed the project is fully functional; no code changes needed.

*Why:* the user reported "Can't reach the ChurnGuard backend" — the frontend's `BackendNotice` component was correctly detecting that the FastAPI backend was not running.

- **Root cause:** the backend (`python -m uvicorn backend.api.main:app --port 8000`) was simply not started. The project code, dependencies, and configuration are all intact and working. No code changes were required.
- **Verified end-to-end:** backend started successfully on `http://localhost:8000` (health endpoint confirmed, optional `langgraph` router skipped as expected). Frontend Vite dev server running on `http://localhost:5173`. Demo dataset flow completed: upload → validate → auto-map (8/8 fields, all high confidence) → train (Optuna-tuned stacking ensemble) → predict → dashboard populated with 300 customers, 58 at risk, $35,583.98 revenue at risk.
- **All pages verified in headless Chromium:** Overview (real KPIs, charts), Customers (300 records in table), Customer Detail (account details, top risk factors), Explainability (SHAP contributions), Recommendations (rule-based actions), Outreach (email drafts), Risk Analytics (charts), Executive View, Settings — all render with real backend data, no blank pages, no console errors beyond the pre-existing THREE.Clock deprecation warning.
- **Build/lint/test all pass:** `npm run build` (exit 0, 46 chunks), `npm run lint` (55 warnings, all pre-existing — no new ones), `npm run test` (6/6 pass, 2 test files). XGBoost audit clean (zero matches in `src/`, `backend/`, `package.json`).
- **Architecture audit:** `@layer base` wrapper intact, `min-w-0` on content wrapper intact, `datasetSetupHydrated` flag intact, `reset_cache()` calls intact, `shared/churnguardFields.json` as single field definition intact, `services/api.js` as single service layer intact, no XGBoost, no hardcoded mock data, no removed features restored.
- **No files changed.** The project was already working correctly — it just needed both servers running simultaneously.

**Commands to run the project (Windows):**
```
# Terminal 1 — Backend
python -m uvicorn backend.api.main:app --reload --port 8000

# Terminal 2 — Frontend
npm run dev
```

**2026-09-08 (session 8)** — Automatic column mapping, CRM/API connectors, and a data-setup flow that no longer asks the user to configure anything it can work out itself.

*Why:* onboarding was still manual — upload, then approve validation, then map every field by hand, then approve processing, then approve prediction. Four of those five clicks asked the user to sign off on work they had no input into, and the mapping step assumed the user knew ChurnGuard's internal schema. The goal for this session was "I connected my customer data and ChurnGuard figured out the rest."

- **One canonical field definition, two readers.** **new** `shared/churnguardFields.json` at the repo root is now THE ChurnGuard field list (8 fields, `version: 2`, each with `description`/`example`/`whyNeeded`/`lookFor`/`aliases`/`keywords`/`expect`). `backend/api/schema.py` loads it; `src/mock/datasetSchema.js` imports it. The hand-maintained Python mirror of `datasetSchema.js` is gone, so the two sides cannot drift. **Do not add a second field list anywhere** — audited clean (`CHURNGUARD_FIELDS = [` matches nothing in `src/` or `backend/`).
- **new `backend/api/mapping.py` — the automatic matcher.** Combines four signals per (column, field) pair: exact name match, known alias (including an alias buried in a longer name), tokenised/semantic name match (camelCase + separators split, abbreviation synonyms like `mths`→`months`, tokens weighted so a word belonging to one field beats one shared by several), and **value evidence from the actual profiled data** — an ID column must have ~unique values, a churn outcome must have exactly two values, charges must parse as numbers. Value evidence is what stops a name-only mistake: a `Churn Reason` column holding free text is rejected as the churn outcome, and `account_manager` is rejected as Customer ID because its values repeat. Assignment is greedy highest-confidence-first, so each column fills at most one field and the strongest match wins a contested column. `monthly_charges` vs `total_charges` gets a dedicated tiebreak on the numbers (lifetime total is essentially always larger than one month's charge) since they share most of their vocabulary.
- **Confidence decides how much the user is asked.** high (>= 0.80) accepted silently; medium (>= 0.55) accepted and shown as "Detected automatically" with a Change action; low (>= 0.35) accepted but flagged for confirmation; below that, not a candidate. Only a *required* field that is unmatched or low-confidence stops the flow. `build_validation_report()` returns `canAutoProcess`, which is the single flag the frontend branches on.
- **The setup flow is now automatic.** `DataManagementPage.jsx` rewritten as a small state machine: choose source → (upload | CRM) → everything else runs with no clicks. **new** `components/data-setup/{SourceSelector,CrmConnectStep,PipelineProgress,ReviewStep,IssueList,DataSourceBadge}.jsx`; `UploadStep`/`CompleteStep`/`steps.js` rewritten. **Deleted** `SetupStepper.jsx`, `ValidationStep.jsx`, `MappingStep.jsx`, `ProcessingStep.jsx` — the manual steps they implemented no longer exist. There are exactly three reasons the flow stops: the data is unusable (`IssueList`), a required field needs a decision (`ReviewStep`), or a CRM needs credentials.
- **`ReviewStep` is an exception screen, not a form.** It shows only the fields that genuinely need a decision as open pickers; confidently-matched fields are statements ("Using your column `months_active` — "months_active" is a name we recognise for this field") with a collapsed **Change** link. Columns ChurnGuard doesn't need are counted under "Additional data" and never become dropdowns — a 115-column file produces zero prompts, not 115.
- **new `backend/connectors/` — provider-agnostic CRM/API architecture.** `base.py` defines the contract (a connector's only job is to return a DataFrame); `hubspot.py` (**available**, private-app token, real API calls), `http_endpoint.py` (**available**, CSV or JSON at a URL), `salesforce.py` (**coming_soon** — scaffolded, needs a registered OAuth app; it *raises* rather than faking a session). `__init__.py` is the registry — adding a provider is one subclass plus one list entry. **new** `backend/api/connector_routes.py` (`/api/connectors`, `/test`, `/sources`, `/import`) and **new** `backend/api/ingest.py`, which is the single place a table becomes a ChurnGuard dataset: an upload and a CRM import both call `register_dataframe()`, so from that point there is one code path — profile → auto-map → validate → train → predict → dashboard. **There is deliberately no separate CRM prediction or dashboard path.**
- **Credentials are never persisted.** They are typed in the connect form, POSTed to our own backend, used for that one request and dropped — not in localStorage, not in a context store, not in a `VITE_` variable, never echoed back to the browser. Secret fields render as masked inputs.
- **`store.DatasetSource`** records where data came from (`upload` / `demo` / `crm`, plus provider and detail), surfaced by **new** `DataSourceBadge` on the setup completion screen and the Overview header. Real uploaded data is never labelled "Demo" and vice versa.
- **Automatic cleaning is reported, never invented.** `_clean_model_frame()` returns a list of operations that actually ran; the completion screen states them verbatim. Verified: a file with 5 duplicate rows reports "5 duplicate row(s) detected and excluded from model training" and processes 320 of 325 rows; a clean file reports nothing at all.
- **The ML pipeline is unchanged.** Same Optuna-tuned stacking ensemble, same SHAP explainer, same preprocessing. This session was ingestion and UX only.

**Bugs found and fixed this session**

1. **Stale model cache — the serious one.** `backend/generic/predictor.py` and `explainer.py` cache the model/scaler/encoders in module-level globals loaded once by `_ensure_loaded()`. Training writes *new* artifacts to disk, but a long-running server kept scoring with the **first** dataset's model: connect a second dataset, get genuinely new training metrics reported, and every customer still scored by the previous model. Caught by running the full pipeline twice and seeing `revenueAtRisk` identical to the cent ($62,621.38) across two different models. Fixed with `reset_cache()` on both modules, called in `run_prediction()` immediately after training. **Any future code that writes new artifacts must call both.** Re-verified: dataset A (320 customers) → dataset Z (180 customers, different distribution) now produces genuinely different KPIs.
2. **Top Churn Drivers rendered blank.** `DashboardPage` and `ExecutiveOverviewPage` filtered drivers to `direction === 'positive'`. Whenever the sampled customers skewed toward staying — every mean SHAP value negative, which is common — the filtered array was empty while `isEmpty={topDrivers.length === 0}` stayed false, so neither the chart nor the empty state rendered. Both now show the strongest drivers in *both* directions with colour encoding the sign (orange raises risk, green lowers it), matching what `AnalyticsPage` already did correctly, plus a `ReferenceLine` at 0 and an axis domain forced to include 0 (without it, an all-negative set draws as full-width bars that read as a large *positive* effect).
3. **`ExecutiveOverviewPage` would crash on a dataset with no retention rate** — it read `metrics.kpis.retentionRate.value` unguarded, but the backend omits a KPI it has no data for. Now filtered the way `DashboardPage` already did.
4. **Raw pandas errors reached the user.** An empty file surfaced "No columns to parse from file". The upload route now checks the extension first ("That file type isn't supported. Upload a CSV, XLSX or XLS file."), catches `EmptyDataError` separately, and falls back to a corrupted-file message.
5. **Stale UI copy:** the upload step said files are "read in your browser, never uploaded anywhere" — untrue since session 7 moved parsing server-side to pandas. Corrected.
6. **The HTTP endpoint connector could never connect.** `require_credentials()` treated *every* credential field as mandatory, and the connect form disabled its button until all were filled — but that connector's Authorization header is documented as optional. Connecting to a public URL was therefore impossible. `CredentialField` gained `required: bool = True`, the auth header is `required=False`, and both the backend check and the form now honour it (the form also labels it "(optional)").
7. **"Backend not running" was reported as a problem with the user's data.** With the API down, uploading failed with "Something went wrong while handling your dataset — try a different file or the demo dataset", which sends people to inspect a file that is fine, and suggests a demo that fails identically. `callDatasetApi()` now separates an unreachable backend (`!err.response`, or 502/503/504) and a timeout (`ECONNABORTED`) from real API errors, and **new** `components/data-setup/BackendNotice.jsx` checks `/api/health` on the Data Management page and warns *before* the user picks a file, with the exact uvicorn command and a "Check again" button. **This was the error the user reported.**
8. **The CRM connect screen dropped its own confirmation** — `test_connection` returns `message` ("Read 320 records with 5 columns") but the UI rendered `connection.detail`, which that payload doesn't have. Now shows the real message.
9. **`xlsx` (SheetJS) was still a declared dependency** even though session 7 deleted the only code importing it. It carried the high-severity advisory recorded in Known Issue #4. Removed — nothing imports it, `npm audit` went from 4 vulnerabilities (1 high, 3 moderate) to 3 moderate, and build/lint/tests are unaffected. Known Issue #4 is now genuinely resolved rather than resolved-in-principle.

**Tested**

- **Automatic mapping across five vocabularies**, all 5/5 required fields, all high confidence: `customer_id/tenure/monthly_charges/contract/churn`; `account_number/months_active/recurring_fee/plan_type/cancelled`; `client_ref/subscription_duration/monthly_spend/agreement/left_service`; a spaced-header XLSX (`Account Number`, `Months Subscribed`, `Recurring Fee`, `Plan`, `Churned?`); and a 17-column file with deliberate traps (`city`, `country`, `employee_count`, `internal_notes`, `account_manager`, `signup_date`, `churn_reason`, `nps_score`) where all 3 optional fields were also found and 9 columns correctly left as additional data.
- **Bad data:** missing churn, missing customer ID, empty file, free-text churn column, single-value churn column, 4-row file, 5 duplicate rows, blank and half-empty columns, a 115-column file, and a `.pdf` — every one either blocked with a specific explanation or processed correctly. The 115-column file auto-processed with zero prompts.
- **Browser (headless Chromium, real servers): 33/33 golden-path checks and 11/11 exception-path checks**, including the CRM flow (HubSpot form, masked token, a bad token producing a real error and never a fake "Connected"), Salesforce shown as Coming soon, the automatic pipeline running with no manual steps, the completion screen's real numbers, the Overview data-source badge, all six other pages rendering, and no horizontal overflow at 390px on four routes. Only console error is the deliberate bad-token 400.
- **CRM path verified end to end for real**, not just by code review: a local HTTP server serving a CSV → connector `test` (no auth header) → `sources` → `import` → auto-map 5/5 → train → dashboard, with the source correctly labelled `kind: crm`. Also covered: the JSON-envelope variant (`{"results": [...]}`), Salesforce refusing rather than faking, and the error text for an invalid URL and a 404. **11/11 browser checks** for the same flow through the real UI.
- **Responsive: 27/27** — 9 authenticated routes at 390px, 820px and 1440px, no horizontal overflow and no broken page anywhere.
- **Per-customer explanations confirmed distinct** — three customers returned different SHAP factors, contributions and ordering, including one where a two-year contract correctly *lowers* risk while month-to-month raises it.
- **Dashboard follows the data** (the test that matters): dataset A → 320 customers / 103 at risk / $62,621 at risk; dataset Z → 180 / 32 / $88,159. Different records, different dashboard.
- `npm run build`, `npm run test` (6/6) and `npm run lint` (55 warnings, all in files this session didn't touch — none of the new components produce any) all pass. XGBoost audit clean; one tooltip implementation; no removed feature restored.

**Still pending after this session**

- **Salesforce is scaffolded, not implemented.** It needs a registered OAuth connected app before it can reach a real org; it currently refuses with an explanation and points the user at a CSV export. HubSpot and the generic HTTP endpoint are the two that really connect.
- **HubSpot was verified against the real API only for the failure path** (an invalid token produces the correct error). A successful pull needs a real HubSpot account token, which this environment doesn't have — the success path is verified by code review and by the shared `register_dataframe()` path an upload already exercises end to end, not by a live pull.
- The setup record that unlocks the app is still per-browser `localStorage`, while the dataset itself lives in the backend's memory. A different browser against a backend that already holds a trained dataset will be sent back through setup. Fine for a prototype, but a real deployment needs server-side session state.

**2026-09-07 (session 7)** — Real backend connected end-to-end; all dummy customer/dashboard/explainability/recommendation/outreach data removed.

*Why:* Known Issue #6 and the "Pending Work" item below had stood since session 4: `backend/` (a genuinely working LightGBM+CatBoost stacking pipeline with SHAP + an LLM outreach generator) existed but was never called by the frontend, which rendered a fixed 20-account SaaS-company mock (`mock/customers.js`) regardless of what a user uploaded. The user asked for the backend properly wired up and the dummy data gone.

- **New backend layer, all under `/api`** (`backend/api/`): `store.py` (in-memory single-active-dataset store — customer records, cached SHAP drivers, cached top-drivers aggregate, outreach drafts; no database, matches the "session-only" framing the UI already used), `schema.py` (Python mirror of `CHURNGUARD_FIELDS`/`suggestMappings` from `mock/datasetSchema.js`), `profiling.py` (Python port of `utils/csv.js`'s row/column profiling and `buildValidationReport`), `recommendations.py` (deterministic driver→action rules, no LLM), `dataset_routes.py` (upload/validate/map-columns/predict, dashboard\*, customers\*, explanation, recommendations, outreach\* — orchestrates `backend/generic/{trainer,predictor,explainer,preprocessing}.py`, no new ML logic). `main.py` gained `CORSMiddleware` and mounts the new router.
- **`POST /datasets/{id}/predict` now genuinely trains** a stacking ensemble on the user's mapped columns (Optuna-tuned, `n_trials=15` — reduced from the library default of 30 to keep a synchronous HTTP request interactive) and returns real `trainingMetrics` (accuracy/precision/recall/F1/ROC-AUC). Verified against both a `TestClient` run and the live `uvicorn` server over real HTTP (upload → validate → map → predict → dashboard → customers → explanation → recommendations → outreach), including a CORS preflight check from the Vite origin.
- **New `backend/llm/explain_generator.py`** (structural sibling of the existing `outreach_generator.py`) — the Explainability page's "plain English" paragraph is now an LLM (Groq, same fallback chain as outreach) summary of the account's *real* SHAP drivers, not canned text.
- **`backend/llm/providers.py`** gained `_fix_mojibake()`, a defensive cp1252↔UTF-8 round-trip repair for the classic "â€"" corruption some LLM responses can carry. (Investigated a false alarm here at length: what looked like server-side mojibake in manual `curl | python` testing was actually `sys.stdin`'s cp1252 default encoding on Windows corrupting the test script's own reading of an already-correct UTF-8 response — confirmed by reading the raw response bytes and decoding explicitly as UTF-8. The fix was kept anyway as a reasonable low-risk defensive measure for genuine provider-side encoding issues, but it was not fixing a real bug in this repo.)
- **`src/services/api.js` rewritten**: `dashboardService`, `customerService`, `explainabilityService`, `recommendationService`, `outreachService` and `datasetService` no longer branch on `VITE_USE_MOCK_API` — they always call the real backend (most of the "real" `apiClient` branches already existed and matched the new backend's paths exactly, since the backend was designed against that existing contract). `authService` keeps its local/mock implementation unconditionally (no backend user-account system exists — a deliberate, documented scope cut, not an oversight). `datasetService` calls got per-call timeout overrides (`runPrediction`: 300s, `generateEmail`: 60s) since training and LLM drafting can legitimately take longer than the default 30s. Dataset errors now surface the backend's real message via a `DatasetError` wrapper instead of a generic fallback.
- **`VITE_USE_MOCK_API` removed entirely** — no code path reads it any more. `.env.example` updated; `SettingsPage`'s "Data source" tab no longer shows a misleading ON/OFF mock toggle, just the connected backend URL.
- **Deleted** (dummy data, no longer read anywhere): `src/mock/customers.js`, `dashboard.js`, `explainability.js`, `recommendations.js`, `outreach.js`, and — now dead once the mock `datasetService` branch was removed — `src/utils/csv.js` (+ its test) and `src/utils/spreadsheet.js` (+ its test). **Kept**: `mock/datasetSchema.js` (still the field-mapping source of truth, mirrored server-side in `backend/api/schema.py`), `mock/demoDataset.js` ("Use demo dataset" now uploads through the exact same real pipeline as a real file — trains a real model on synthetic data instead of returning a canned report), `mock/users.js` (auth stays local), `mock/notifications.js` (unrelated feature, the floating AI assistant widget and notification panel are untouched).
- **Real customer record shape** replaces the old SaaS-company mock everywhere: `{ id, tenure, monthlyCharges, totalCharges, contractType, serviceTier, paymentMethod, churnProbability, riskTier, status, revenueAtRisk, churned }`. `id` is the value from the user's mapped ID column — there is no `name`/`company`/`contactName`/`email` any more because the Telco-style schema (`CHURNGUARD_FIELDS`) never had them; inventing them to keep the old UI shape would just be new dummy data. `getPrimaryRiskDriver()` (read only-in-mock fields: `usage`/`engagement`/`loginFrequency`/`nps`/`openTickets`) is deleted from `utils/helpers.js`.
- **Every page touching customer/dashboard data rewired to the real fields**, same layout/components: `CustomersPage` (columns → ID/Tenure/Monthly Charges/Contract/Risk/Status, dropped Plan filter), `CustomerDetailPage` (header drops company/owner; the old engagement/usage/healthScore/NPS gauge grid is replaced by a real "Account details" grid; "Risk over time" — no history exists for a snapshot upload — replaced by a "Top risk factors" panel reusing the Explainability SHAP call; "Recent activity" timeline replaced the same way), `DashboardPage` and `ExecutiveOverviewPage` (stopped importing `mockCustomers` directly, fetch via `customerService`/`dashboardService`; triage tables drop fabricated "Weakest Signal"/"Primary Driver"/"Recommended Action" text columns), `ExplainabilityPage` and `RecommendationsPage` (account selector now fetches the real customer list; `confidenceScore`, which was never a real quantity, is gone), `OutreachPage` (the "To" field shows the Customer ID only — no fabricated contact name/email — and "Send" is relabeled "Mark as sent" since there is no real delivery integration), `AnalyticsPage` (`riskByRegion` → `riskByServiceTier`, since no region field exists in the schema; churn-trend renders its real empty state), `SearchCommand.jsx` (Cmd+K palette now does a real debounced `customerService.getCustomers({search})` instead of filtering the mock array). `utils/glossary.js` pruned of SaaS-only metric entries (`healthScore`, `engagement`, `usage`, `mrr`, `nps`, `loginFrequency`, `supportTickets`, `plan`, `riskByRegion`) and gained real ones (`monthlyCharges`, `totalCharges`, `contractType`, `riskByServiceTier`).
- **`data-setup/CompleteStep.jsx`** rewritten: it used to say "this prototype does not train a model on your data" and "risk scores... are simulated demo output" — both now false. It states plainly that a model was just trained on the user's data and shows a real "Model performance" fact block (accuracy/precision/recall/ROC-AUC) from the new `trainingMetrics` field threaded through `DataManagementPage.jsx`'s `completeDatasetSetup()` call.
- **Charts requiring time-series history are honestly empty, not fabricated.** An uploaded dataset is one snapshot; churn-trend and revenue-at-risk-over-time have no real source and now return `[]` from the backend, rendering `ChartCard`'s existing empty state with an explanation. Risk-by-contract, risk-by-tenure and top-drivers are all genuinely computed from the trained model and the uploaded data.
- **Verified**: `npm run build`, `npm run lint` (no new warnings — pre-existing ones untouched), `npm run test` (6/6 pass; the 32 tests in the two deleted test files tested now-deleted dead code, not a regression). Backend verified via a full live HTTP run (not just `TestClient`) covering every endpoint including a real Groq-drafted outreach email and a CORS preflight from `http://localhost:5173`. **Not verified**: an actual browser click-through of the golden path — no Playwright/browser-automation tool was available in this session, so the UI layer was verified by code review + build/lint/test + the live API contract checks above, not by looking at rendered pages. A future session should do a real browser pass per the project's established verification pattern (see sessions 4-6 below) before calling this fully done.
- **`backend/db/database.py`** (a leftover unused Postgres connection-test script, not imported anywhere) was left untouched — out of scope, unrelated to this change.

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

- **NO XGBOOST** — see Important Constraints. (When re-auditing: `backend/generic/artifacts/model.joblib` contains the string `xgboost_dart_mode`. That is a **LightGBM** parameter name inside a LightGBM model dump, not an XGBoost dependency. Everything else in the repo is clean.)
- **ONE appearance state.** `AppContext.theme` / `setTheme`, defined once in `utils/theme.js`. The header control and Settings → Appearance are two views of it — never add `headerTheme`/`settingsTheme`, a second toggle with local state, or a second storage key. The pre-paint script in `index.html` is the only other reader of `churnguard_theme`; keep it in step with `THEME_STORAGE_KEY`.
- **Colour tokens are declared per theme in `src/index.css`, in `@layer base`, with an attribute selector.** Don't move them to `:root` (a nested `data-theme` — the landing page — would stop working) and don't hardcode hex in components; use the tokens or `getRiskColor()`.
- **`services/datasetHistory.js` is the only dataset-history store**, and IndexedDB access belongs in its driver, not in components. Don't add a second history list, don't copy customer records/scores/dashboards into it, and don't put dataset content in `localStorage`.
- **Restoring a saved dataset must keep going through `DataManagementPage`'s existing pipeline** (`?restore=<id>` → rebuild the `File` → `runUpload`). A separate "history ingestion" path would be a second way to create a dataset, which is exactly what `ingest.register_dataframe()` exists to prevent on the backend.
- **Don't claim a restored dataset is still trained.** Reconnecting genuinely re-registers and retrains; the copy exists so the user doesn't hunt for the file, not to fake persistence.
- **`DataFlowRail`'s `<li>` needs `relative`** — its `sr-only` spans are absolutely positioned and will otherwise escape every overflow container and widen the page at 390px.
- **Don't import `MetricCard` (or anything Recharts-backed) into Data Management or History** — it drags the chart bundle into routes that show no charts. The lazy split of `UploadStep`/`CrmConnectStep`/`ReviewStep`/`IssueList`/`demoDataset` is deliberate; keep new heavy step UI lazy too.
- **Don't reintroduce the removed branding**: "Deloitte Capstone 2026", "SOC 2 Compliant (Pending)", or the footer's Platform/Pricing links. Don't replace them with other unsupported compliance/sponsor claims, and don't add `href="#"` placeholder links.
- **Don't re-add a Data tab to Settings.** Data belongs to Data Management and History. Settings keeps Profile / Organization / Notifications / Security / Appearance.
- **Every link the app offers must resolve.** That includes `mock/notifications.js` entries and the assistant's canned `actions` — both previously pointed at customer IDs from a deleted mock. Don't put a specific customer id in canned content; link to a page instead.
- **The DEMO badge is derived from the connected dataset, never hardcoded.** Labelling a real upload as demo data (or vice versa) is the thing `DataSourceBadge` exists to prevent.
- **One logout path.** `AuthContext.logout` → `authService.logout`. Profile and Security both call it; don't add a second auth/session mechanism.
- **`shared/churnguardFields.json` is the only ChurnGuard field definition.** The frontend (`src/mock/datasetSchema.js`) and backend (`backend/api/schema.py`) both read it. Do not reintroduce a hand-maintained copy on either side, and do not create `datasetSchema2.js` or an equivalent.
- **`generic_predictor.reset_cache()` and `generic_explainer.reset_cache()` must be called after any code that trains and writes new artifacts** (currently `run_prediction()` does it). Both modules cache the model in process-level globals; without the reset, a second dataset is silently scored by the first dataset's model. See session 8's bug 1.
- **A CRM import and a file upload must keep converging on `ingest.register_dataframe()`.** The whole connector design depends on there being exactly one dataset representation and one prediction/dashboard path.
- The `@layer base { ... }` wrapper around the global reset in `src/index.css` — removing it reintroduces the sidebar-offset bug described in Known Issues #1.
- **(Superseded session 7, rule below is the current one)** ~~The mock-vs-real branching pattern in `src/services/api.js`~~ — that seam existed to let a real backend swap in without UI changes; a real backend now exists and is the only path, so the branch was removed for `dashboardService`/`customerService`/`explainabilityService`/`recommendationService`/`outreachService`/`datasetService`. The part of the rule that still matters: **`services/api.js` stays the one place that calls `apiClient` — don't bypass it with direct fetches in components.**
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
- **(Historical — `mock/dashboard.js` was deleted session 7)** Don't reintroduce hand-typed KPI values anywhere in the dashboard path. KPIs are now computed server-side in `backend/api/dataset_routes.py` from the actual stored customer records — the equivalent rule now is: don't hardcode a KPI in the frontend that duplicates what the backend already computes.
- **Don't re-add Simulator / Playbooks navigation** without also restoring the pages, services and mock data — the sidebar must never offer a link that 404s.
- **Don't turn the AI assistant back into a page or a sidebar item.** It is intentionally a global floating widget (session 6). Mount it once, in `AppLayout`.
- **Don't hardcode portfolio figures into `getDemoChatResponse`** — the "summarize" reply derives them from `mockDashboardKPIs` so the assistant can't contradict the Overview.
