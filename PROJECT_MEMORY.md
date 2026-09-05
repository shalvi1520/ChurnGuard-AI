# PROJECT_MEMORY.md — ChurnGuard Frontend

**Read this file AND `claude.md` before starting any new work on this project.**
This file is the persistent memory for coding agents. Update it after every meaningful change: what changed, which files, why, what's now working, what remains.

---

# Project Overview

ChurnGuard is a frontend prototype for an AI-powered customer retention intelligence platform for SaaS Customer Success teams. It is a capstone project (Manipal University Jaipur / Deloitte-style capstone — see the green Deloitte-esque accent color and "Deloitte Capstone 2026" badge on the landing page, which is deliberate branding for this project, not an actual Deloitte product).

This repo (`PRT 1`) was created by copying a mature, mostly-complete existing implementation from a sibling folder (`C:\Users\Admin\Desktop\Antigravity_workspace`) per explicit user instruction, then extending it. That source folder is now considered historical — **all future work happens in this repo (`PRT 1`)**, not in `Antigravity_workspace`.

Reference documents that informed this build (not copied into the repo, live on Desktop):
- `Desktop/Deloitte Capstone/user_flow_diagram.md` — canonical user flow (Landing → Login/Signup → Onboarding → Data Management → Dashboard → Customers → Customer Detail → Explainability → Recommendations → Outreach; Simulator and AI Assistant as side branches).
- `Desktop/Deloitte Capstone/ChurnGuard_AI-Powered_Customer_Retention_Intelligence-*.pptx/.pdf` — capstone presentation (contains OUTDATED XGBoost references — do not use).
- `Desktop/Sifa/ChurnGuard_Master_Specification.docx`, `ChurnGuard_Product_Bible.pdf`, `ChurnGuard_Detailed_User_Journey_PRD.pdf` — product spec docs.
- `Desktop/Deloitte Capstone/Telco_customer_churn.xlsx` — the reference dataset (Telco churn, 7043 rows, 21 columns) that all mock data is modeled after.

# Product Goal

PREDICT → EXPLAIN → ACT. Help Customer Success teams: identify at-risk customers, understand *why* (SHAP-style explanation), decide what to do (recommended action), review an AI-drafted outreach email (human-approved, never auto-sent), and track outcomes. Secondary loop: Playbooks/Automation for rule-based triggers, Analytics for aggregate retention performance.

This is a **prototype**, not a production ML system. Predictions, SHAP values, and dataset processing are realistic **mock/demo data** unless a real FastAPI backend is connected. The one exception is the AI Assistant, which *can* call a real LLM (Grok/xAI) through a small server-side proxy — see "AI Assistant / Grok Integration" below — but defaults to demo mode.

# Current Architecture (ML pipeline — conceptual, NOT implemented in this frontend)

```
Telco Dataset → Cleaning → Leakage Removal → Scaling → PSO/ACO Feature Selection
  → TabNet → SHAP → Stacking Ensemble (LightGBM + CatBoost + Random Forest + Logistic Regression)
  → FastAPI → This Dashboard (Next.js/React SPA)
```

**⚠️ NO XGBOOST — CONSTRAINT, NOT A SUGGESTION.** The source presentation (`.pptx`) contains outdated XGBoost references from an earlier project iteration. XGBoost must never appear in code, mock data, UI copy, comments, or docs in this repo. Verified clean as of 2026-09-03 (`grep -ri xgboost` across `src/`, root `.md` files, `package.json` → zero matches). Re-run this grep after large additions.

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
- **Express + dotenv** (added 2026-09-02) — a minimal Node server (`server.js`) that proxies AI Assistant requests to the Grok/xAI API. Optional — not required to run the app.
- **`@react-three/fiber` + `three`** (in use since 2026-09-03) — the landing hero's decorative node-field background (`Hero3DBackground.jsx`). `@react-three/drei` is installed but **not used** — it was tried for the connecting lines (`<Line>`) and dropped in favor of a plain `lineSegments`/`BufferGeometry` (drei didn't meaningfully reduce bundle size and added an extra dependency for one helper). Leave `drei` installed only if something else starts using it; otherwise it's safe to remove.
- `xlsx` is installed but unused anywhere in `src/` (dead dependency, inherited from before this session — see Known Issues).

# Folder Structure

```
PRT 1/
├── server.js                  # Grok/xAI proxy server (optional, see AI Assistant section)
├── .env / .env.example        # Vite + server env vars (see below)
├── vite.config.js             # Vite config + dev proxy for /api/assistant → server.js
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── ui/                # Design system: Button, Card, Input, Select, Badge, Modal, Tabs,
│   │   │                      # Avatar, Skeleton, EmptyState, Toast, Pagination, MetricCard,
│   │   │                      # FloatingChatWidget, ErrorBoundary
│   │   ├── ModelArchitecture.jsx   # NEW — collapsible ML pipeline visualization
│   │   └── SearchCommand.jsx  # Cmd+K command palette
│   ├── context/                # AuthContext, AppContext (React Context, no external state lib)
│   ├── features/notifications/ # NotificationPanel
│   ├── layouts/                 # AppLayout (sidebar+header shell), AuthLayout
│   ├── mock/                    # ALL mock data lives here — customers, dashboard, explainability,
│   │                             # recommendations, outreach, notifications, users, playbooks (NEW)
│   ├── pages/                   # One file per route (see Pages below)
│   ├── routes/index.jsx         # Single source of truth for routing
│   ├── services/api.js          # THE service layer — every data access goes through here
│   └── utils/helpers.js         # cn(), formatters, risk color/label helpers, delay()
```

# Pages (routes)

Public: `/` (LandingPage), `/login`, `/signup`, `/forgot-password`.
Protected (behind `ProtectedRoute`, wrapped in `AppLayout` sidebar+header): `/dashboard`, `/customers`, `/customers/:id`, `/analytics`, `/explainability`, `/recommendations`, `/outreach`, `/simulator`, `/data-management`, `/playbooks` (NEW), `/playbooks/new` (NEW), `/ai-assistant`, `/settings`, `/executive`.
Protected but **bare** (no sidebar chrome, its own full-screen flow, via `BareProtectedRoute`): `/onboarding` (NEW).
Fallback: `*` → NotFoundPage.

**New pages added 2026-09-02/03:**
- `OnboardingPage.jsx` — 4-step wizard (Company Setup → Customer Information → Retention Goals → Connect Data) shown after signup, before the main app. Skippable via a "Skip setup" link (goes to `/dashboard`); completing it goes to `/data-management`. Purely local state, nothing persisted to a backend (no such endpoint exists) — this is intentional for a prototype.
- `PlaybooksPage.jsx` — lists automation rules (mock data from `mock/playbooks.js`) as cards with Trigger/Action/Outcome and a Pause/Activate toggle.
- `CreateAutomationPage.jsx` — 4-step wizard (Trigger → Conditions → Action → Activate) ending in a "Playbook ready" confirmation screen. Deliberately simple — no actual rule engine, just a data-entry wizard that appends to the mock playbooks list.

# Components

Design system components in `src/components/ui/` were NOT modified except where noted. Reuse these for any new UI — do not create parallel one-off styled elements.

- **`ModelArchitecture.jsx`** (NEW, `src/components/`) — collapsible panel showing the 10-stage ML pipeline (Data → Cleaning → Leakage Removal → Scaling → PSO/ACO → TabNet → SHAP → Stacking Ensemble → FastAPI → Dashboard). Includes an explicit disclaimer that this is conceptual and predictions elsewhere in the app are demo data. Embedded in `ExplainabilityPage` (below the AI explanation) and in `DataManagementPage` (during the "Processing" step, `defaultOpen`).
- **`Hero3DBackground.jsx`** (NEW, `src/components/`, 2026-09-03) — decorative React Three Fiber scene for the landing page hero: ~40 small spheres colored by the same risk palette used elsewhere (mostly accent/green, a few amber/orange/red), loosely connected by thin lines, slowly rotating. Represents "many customers being watched, a few drifting into risk" without being literal — see spec section 10/11 ("Risk intelligence visualization", "floating customer/risk nodes"). Lazy-loaded from `LandingPage.jsx` via `React.lazy`/`Suspense fallback={null}` so it never delays the hero text/CTA's first paint. **Skips rendering entirely** (returns `null`) on `prefers-reduced-motion: reduce` or viewport width < 768px — verified via Playwright (`canvas` element count is 0 in both cases). Non-interactive: `pointer-events-none`, no orbit controls; verified the hero CTAs are still clickable through it.
  - **Placement is mask-driven, not position-driven**: the wrapping div's `mask-image` is an inverted radial gradient — `transparent` in the center ~40% (where the headline/subtitle/buttons live) fading to fully visible by ~78% radius. This keeps every node/line out of the readable text area while still framing the hero at the edges/corners. **If you ever see nodes overlapping the headline text again, the mask direction was likely flipped by mistake** — `transparent` = hidden, `black` = visible, and the *center* stop must be `transparent`.
  - Bundle note: the lazy chunk is ~230KB gzipped, almost entirely `three.js` core pulled in by `@react-three/fiber`'s `<Canvas>` — this doesn't meaningfully tree-shake regardless of import style (tried named imports from `three` instead of `import * as THREE`; no change). Accepted tradeoff since it's lazy, desktop-only, and loads after first paint. Don't try to chase this further without a real reason (e.g. don't add postprocessing/bloom libraries on top of it).

# Services (`src/services/api.js`)

Single service layer, already existed and is well-structured — extended, not replaced. Every service function checks `VITE_USE_MOCK_API` and either returns mock data (with a simulated `delay()`) or calls the real backend via the shared `apiClient` (axios, `baseURL` = `VITE_API_BASE_URL`, default `http://localhost:8000/api`).

Existing: `authService`, `dashboardService`, `customerService`, `explainabilityService`, `recommendationService`, `outreachService`, `datasetService`, `chatService`, `notificationService`, `simulatorService`.

**New:** `playbookService` (`getPlaybooks`, `togglePlaybook`, `createPlaybook` — in-memory mock store, resets on page reload).

**Changed:** `chatService.sendMessage` — see AI Assistant section below for the new live/demo split.

# API Routes (conceptual — for when a real FastAPI backend is connected)

Implied by `services/api.js`'s non-mock branches: `POST /auth/login`, `POST /auth/signup`, `GET /dashboard*`, `GET /customers`, `GET /customers/:id`, `GET /customers/:id/explanation`, `GET/PUT /customers/:id/recommendations`, `POST /customers/:id/outreach/generate`, `POST /datasets/upload|validate|map-columns|predict`, `POST /chat`, `POST /simulator/what-if`, and (new) `GET /playbooks`, `POST /playbooks`, `POST /playbooks/:id/toggle`. None of these are implemented server-side — connecting a real FastAPI backend means implementing these to match the shapes already used by the mock data (see `src/mock/*.js` for exact JSON shapes).

# Mock Data (`src/mock/`)

`customers.js`, `dashboard.js`, `explainability.js`, `recommendations.js`, `outreach.js`, `notifications.js`, `users.js`, and (new) `playbooks.js`. All hand-authored, modeled loosely on the Telco Customer Churn dataset. Do not scatter new mock data into components — add to this directory and wire through `services/api.js`.

# Demo Behavior

- **One-click demo entry**: Landing page "Explore Demo" button → `/login?demo=true`. `LoginPage` detects `?demo=true` and auto-submits the pre-filled demo credentials (`demo@churnguard.ai` / `demo2026`) on mount, landing directly on `/dashboard`. No typing required (spec section 39).
- **Use Demo Dataset**: `/data-management` step 0 has a "Use Demo Dataset" button next to the real upload flow — constructs a synthetic `File` object and runs it through the exact same upload → validate → map → process → predict pipeline as a real upload, so there's only one code path to maintain.
- **Demo mode indicator**: `AppContext.demoMode` (currently hardcoded `true`) shows a "DEMO" badge in the header/sidebar.
- Any mock/simulated result in the UI is explicitly labeled as such (e.g., outreach drafts say "AI-generated draft — review before sending"; the What-If Simulator is labeled as a simulation; `ModelArchitecture` explicitly says predictions are demo data).

# AI Assistant / Grok Integration

The floating chat widget and `/ai-assistant` page both go through `chatService.sendMessage()`.

- **Default (out of the box)**: `VITE_USE_LIVE_ASSISTANT=false` (or unset) → always uses local canned demo responses (`getDemoChatResponse` in `api.js`, refactored out of the old inline mock logic — behavior unchanged from before). No network call, no backend needed. This is what ships by default in `.env`.
- **Live mode**: set `VITE_USE_LIVE_ASSISTANT=true`. The frontend then POSTs to `VITE_ASSISTANT_API_URL` (default `/api/assistant`, proxied by `vite.config.js` to `http://localhost:8787` in dev) instead of using canned responses. **On any failure (proxy not running, no API key, network error), it silently falls back to the same demo responses** — the UI never breaks or shows a raw error.
- **`server.js`** (project root) — a ~70-line Express server, started separately via `npm run server`. Reads `XAI_API_KEY` from `.env` (via `dotenv`) and calls `https://api.x.ai/v1/chat/completions` server-side. **The key never reaches client code or the browser.** Returns 503 if the key isn't set (frontend treats that as a failure and falls back to demo). Model is configurable via `XAI_MODEL` (default `grok-4-fast`).
- To actually get live Grok responses locally: `npm run server` in one terminal, `npm run dev` in another, with `.env` containing `XAI_API_KEY=...` and `VITE_USE_LIVE_ASSISTANT=true`.
- This satisfies the "never expose API key client-side" + "must still work in demo mode without a key" constraints from the spec.

# Completed Features (as of 2026-09-03)

Everything in the spec's core user journey works end-to-end and was verified in a real headless-Chromium run (Playwright), not just by reading code:
Landing (with 3D risk-node hero background) → Explore Demo (one-click) → Dashboard → Customers → Customer Detail → Explainability (SHAP + AI explanation + architecture viz) → Recommendations → Outreach (AI draft, human-approve) → What-If Simulator → Analytics → Playbooks (list + toggle) → Create Automation (wizard → "Playbook ready") → Data Management (real upload flow + "Use Demo Dataset" shortcut) → AI Assistant (demo mode) → Settings → Onboarding (post-signup, skippable).

No XGBoost anywhere. No exposed secrets (`.env` is gitignored; `XAI_API_KEY` server-side only).

# Current Development State

Stable. `npm run build`, `npm run test`, and `npm run lint` all pass (lint has ~131 pre-existing warnings — unused imports and a couple of `react-hooks/exhaustive-deps` — all pre-existing from the inherited codebase, not introduced by this session; see Known Issues).

# Pending Work

- **Recharts bundle size** — `npm run build` warns about a >500kB chunk (`index-*.js`, mostly Recharts + core). Pre-existing, not addressed — would need route-level chart code-splitting if it becomes a real problem.
- **`xlsx` dependency** — installed, unused, and has an unpatched high-severity advisory (see Known Issues). Safe to remove if confirmed unused by a future agent (`grep -r "from 'xlsx'" src/` returns nothing as of this writing).
- Onboarding data (company/industry/goals) is collected but not persisted anywhere (no backend, no localStorage) — purely a UX flow demonstration. If a future agent wants it to "stick," it should go through `AppContext` or a new mock service, not ad-hoc localStorage.

# Known Issues

1. **(Fixed 2026-09-03, documented so it isn't reintroduced)** `src/index.css` had an **unlayered** global reset (`* { margin:0; padding:0; box-sizing:border-box }` directly in the stylesheet, not inside `@layer base`). Under Tailwind v4's CSS Cascade Layers, unlayered rules beat ALL layered rules (including every Tailwind utility) regardless of specificity — this silently zeroed out `margin-left`/`margin-right`/etc. utilities app-wide, which broke the sidebar's `lg:ml-60`/`lg:ml-16` content offset on **every single authenticated page** (content rendered underneath the fixed sidebar, clipped). Fixed by wrapping the reset in `@layer base { ... }`. **Rule for future CSS edits in this file: any new global/reset-style rule (bare element or `*` selectors) MUST go inside `@layer base { }`, or it will silently override Tailwind utilities again.** Verified fixed via computed-style inspection (`margin-left` now correctly resolves to `240px`) and a full Playwright run through every major page.
2. Duplicate React key warning in `DataManagementPage`'s column-mapping `<Select>` (the current-value option duplicated one of the fixed target options) — fixed 2026-09-03 by deduplicating the options list.
3. `npm audit` reports a moderate DoS advisory in `qs` (a transitive dependency of the `express` package added for the Grok proxy) with **no fix currently published upstream** (`npm audit fix` does not resolve it). Low real-world risk here since `server.js` only runs locally for the optional live-Grok feature and is never deployed/exposed. Re-run `npm audit` periodically; upgrade `express` when a patched `qs` ships.
4. `npm audit` also reports a high-severity advisory in `xlsx` with no fix available — pre-existing, and the package appears unused in `src/` (see Pending Work).
5. ~131 pre-existing ESLint/oxlint warnings (unused imports, a few missing `useEffect` deps) scattered across pages not touched this session (`DashboardPage`, `CustomersPage`, `CustomerDetailPage`, `OutreachPage`, `SimulatorPage`, etc.). Not fixed — out of scope for this session's task (kept changes focused per project rules); safe to clean up in a dedicated pass later.

# Important Design Decisions

- **Kept Vite/React instead of migrating to Next.js**, despite the spec architecture diagram saying "Next.js Dashboard" — the inherited codebase was already a mature Vite SPA; rewriting the framework would have been a large, unjustified refactor of working code. See Architecture section.
- **Onboarding is a separate "bare" route**, not wrapped in the normal `AppLayout` sidebar — it's a linear first-run flow, not part of the main app shell. Added a `BareProtectedRoute` helper in `routes/index.jsx` for this (same auth guard as `ProtectedRoute`, no chrome).
- **AI Assistant defaults to demo mode**, live Grok is opt-in via env var — protects against the app looking broken for anyone who clones this without an xAI key, per the spec's explicit "must work in demo mode" requirement.
- **Playbook actions never auto-send anything** — the automation builder explicitly tells the user that outreach-related actions only draft/flag, mirroring the existing Outreach page's human-approval requirement. Kept consistent on purpose.
- **Package renamed** `antigravity-workspace` → `churnguard-frontend` in `package.json` for clarity (cosmetic only, no functional impact).

# Important Constraints

- **NO XGBOOST.** Anywhere. Ever. Re-audit (`grep -ri xgboost` across `src/`, `*.md`, `package.json`) after any large change, especially if copying content from the reference `.pptx`/`.pdf` docs on the Desktop.
- Never hardcode the `XAI_API_KEY` or any secret. It lives in `.env` (gitignored) and is read only by `server.js` (Node process), never by client code.
- Do not claim mock/simulated data is a real model result in UI copy — always label appropriately (already the pattern throughout; keep it).
- Don't create duplicate components/pages for small variations — extend what's in `src/components/ui/` and `src/pages/`.

# Integration Assumptions

- A real backend is assumed to be **FastAPI**, base URL configured via `VITE_API_BASE_URL`, matching the endpoint shapes implied by `services/api.js`'s non-mock branches (see API Routes above).
- The AI Assistant's live path assumes an **xAI Grok**-compatible chat completions API (`https://api.x.ai/v1/chat/completions`, OpenAI-style request/response shape). If a different LLM provider is used later, only `server.js` needs to change — the frontend contract (`POST /api/assistant` → `{ message, actions }`) stays the same.

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
- `XAI_API_KEY` must never move into a `VITE_`-prefixed variable or any client-side file — that would expose it in the browser bundle.
- Don't rename `PROJECT_MEMORY.md` or `claude.md`, and don't create duplicate copies of either.
- Don't reintroduce large-radius blurs (`blur-[100px]`+) or `backdrop-filter` on fixed/full-viewport elements — that cost the landing page ~50fps of scroll performance (see Performance Notes).
- Don't convert the hero 3D back to one mesh per node, and don't remove its WebGL/FPS guards — those are what keep the effect from tanking weaker machines.
