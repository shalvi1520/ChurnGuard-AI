# ChurnGuard - AI-Powered Customer Retention Intelligence

## 1. Project Overview

**ChurnGuard** is an AI-powered customer retention platform for SaaS businesses. It predicts which customers are at risk of churning, explains the underlying reasons using SHAP (SHapley Additive exPlanations) values, and helps Customer Success teams take immediate, personalized action.

The system follows a three-step pipeline:
1. **PREDICT**: Identify at-risk customers using a stacking ensemble.
2. **EXPLAIN**: Show *why* a customer is at risk, via SHAP feature contributions.
3. **ACT**: Generate retention recommendations and personalized outreach emails.

In the product these map to **Explainability = WHY**, **Recommendations = WHAT**, **Outreach = HOW**.

This repository contains both the React + Vite frontend and the FastAPI + ML backend (`backend/`).

## 2. Key Features

- **Executive Dashboard**: Retention metrics, revenue at risk, churn trend, and risk distribution.
- **Customer CRM & Details**: Filtering, searching and sorting; per-customer health scores, risk trends and activity.
- **SHAP Explainability View**: Which factors are pushing a customer's churn risk up or down.
- **AI-Generated Recommendations**: Context-aware suggested actions, with an approve/reject workflow.
- **Automated Outreach Generation**: Drafted emails addressing the specific churn drivers. Human review required before sending.
- **Data Management Workflow**: Upload (CSV/Excel) or connect a CRM, validate, map columns, then predict.
- **CRM Connectors**: HubSpot and a generic HTTP/API endpoint connector.
- **Real Authentication**: Email/password accounts, Google sign-in, server-side sessions — see [§6](#6-authentication).

## 3. Technology Stack

| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Language** | JavaScript (ES6+) / Python | React app / backend and ML. |
| **Frontend Framework** | React 19 & Vite | Component-based architecture, fast builds. |
| **Styling** | Tailwind CSS v4 | Utility-first CSS enforcing the design system. |
| **Routing** | React Router v7 | Client-side routing, protected routes, lazy loading. |
| **State Management** | React Context API | Global state (Auth, App/UI) without extra dependencies. |
| **Data Visualization** | Recharts | Responsive, composable charting. |
| **Animation** | Framer Motion | Page transitions and micro-interactions. |
| **Icons** | Lucide React | Consistent iconography. |
| **Form Handling** | React Hook Form & Zod | Form state and schema-based validation. |
| **Backend** | FastAPI + SQLAlchemy | API, accounts, dataset history. |
| **ML** | LightGBM, CatBoost, scikit-learn, Optuna, SHAP | Stacking ensemble, tuning, explainability. |
| **Database** | PostgreSQL (SQLite supported) | Accounts, sessions, dataset and training history. |

## 4. Installation and Setup

### Prerequisites
- **Node.js**: v18.x or higher
- **npm**: v9.x or higher
- **Python**: 3.11+

### Environment Variables

**Frontend** — create a `.env` in the repository root (see `.env.example`):

| Variable | Required | Description | Example |
| :--- | :--- | :--- | :--- |
| `VITE_API_BASE_URL` | No | URL of the backend API. | `http://localhost:8000/api` |

> `VITE_*` variables are inlined into the JavaScript bundle and are therefore
> public. Never put a secret — a client secret, a session key, an API token —
> in one. All backend configuration lives in `backend/.env`, which is never
> shipped to the browser.

**Backend** — create `backend/.env` (see `backend/.env.example`). Required:
`DATABASE_URL`, `JWT_SECRET`. Optional: OAuth and SMTP settings, covered in
[AUTH_SETUP.md](AUTH_SETUP.md).

### Installation Steps

1. **Install frontend dependencies**:
   ```bash
   npm install
   ```

2. **Install backend dependencies**:
   ```bash
   pip install -r backend/requirements.txt
   ```

3. **Create the database schema**:
   ```bash
   python -m alembic upgrade head
   ```

4. **Start the backend** (from the repository root):
   ```bash
   python -m uvicorn backend.api.main:app --reload --port 8000
   ```

5. **Start the frontend**:
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:5173`.

### Running the Application
- **Development**: `npm run dev` starts Vite with Hot Module Replacement.
- **Production Build**: `npm run build` compiles to `dist/`.
- **Tests**: `npm test` (frontend), `python -m pytest backend/tests/` (backend).
- **Lint**: `npm run lint`.

## 5. Database

The application runs on **PostgreSQL**. `DATABASE_URL` in `backend/.env` selects
the database, and **SQLite is fully supported** by the same code — set
`DATABASE_URL=sqlite:///./churnguard.db` and everything works, with no frontend
change of any kind. The schema uses portable column types deliberately so the
two stay interchangeable; the backend test suite runs on SQLite when no local
Postgres is reachable.

Schema changes go through Alembic:

```bash
python -m alembic upgrade head          # apply migrations
python -m alembic revision --autogenerate -m "description"
```

Startup also calls `create_all()`, which creates any missing table but never
alters or drops one — so a fresh checkout works without a migration step, while
existing data is never at risk. Database files (`*.db`, `*.sqlite3`) are
gitignored and must never be committed.

## 6. Authentication

Accounts are real: passwords are bcrypt-hashed, sessions are server-side rows
addressed by an opaque token in an **HttpOnly cookie**, and signing out deletes
the session rather than merely forgetting a token.

**Supported sign-in methods**
- Email and password
- Google (OAuth 2.0 / OpenID Connect)
- Password reset by emailed, single-use, expiring link

**Endpoints**

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/auth/signup` | Create an account (201) |
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/logout` | End the session |
| `GET` | `/api/auth/me` | The signed-in user, or 401 |
| `GET` | `/api/auth/providers` | Which OAuth providers are configured |
| `GET` | `/api/auth/google` | Start Google sign-in |
| `GET` | `/api/auth/google/callback` | Google redirect target |
| `POST` | `/api/auth/forgot-password` | Request a reset link |
| `POST` | `/api/auth/reset-password` | Set a new password |

**Google sign-in requires you to register an OAuth application** with Google
and put the resulting credentials in `backend/.env`. Until you do, the button
is disabled and explains that it is not configured — it never fakes a
sign-in. Full step-by-step instructions, including the exact
redirect URIs to register, are in **[AUTH_SETUP.md](AUTH_SETUP.md)**.

**Password-reset email** requires SMTP settings in `backend/.env`. Without
them the reset link is still generated and written to the backend log, and the
UI says plainly that email delivery is not configured rather than claiming a
message was sent.

There are no demo credentials and no demo sign-in bypass. Anyone who wants to
try the product signs up.

## 7. Documentation

- [AUTH_SETUP.md](AUTH_SETUP.md) — Google OAuth and SMTP setup
- [ARCHITECTURE.md](ARCHITECTURE.md) — system architecture
- [DEVELOPMENT.md](DEVELOPMENT.md) — development notes
- [PROJECT_MEMORY.md](PROJECT_MEMORY.md) — decision history
