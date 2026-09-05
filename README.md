<<<<<<< HEAD
# ChurnGuard - AI-Powered Customer Retention Intelligence

## 1. Project Overview

**ChurnGuard** is a sophisticated, AI-powered customer retention platform tailored for SaaS businesses. It solves the critical problem of unexpected customer churn by predicting which customers are at risk, explaining the underlying reasons using SHAP (SHapley Additive exPlanations) values, and empowering Customer Success teams to take immediate, personalized action.

The system follows a three-step pipeline:
1. **PREDICT**: Identify at-risk customers using advanced machine learning models.
2. **EXPLAIN**: Demystify the "why" behind the risk using SHAP-based feature contributions.
3. **ACT**: Generate AI-driven retention recommendations and personalized outreach emails to prevent churn.

This repository contains the production-ready frontend application built with React, Vite, and Tailwind CSS, featuring a premium enterprise-grade design language.

## 2. Key Features

- **Executive Dashboard**: A comprehensive overview of retention metrics, revenue at risk, churn trend, and risk distribution across the customer base.
- **Customer CRM & Details**: Advanced filtering, searching, and sorting of the customer base. Individual customer views showing health scores, risk trends, and activity timelines.
- **SHAP Explainability View**: Visualizes exactly which factors (e.g., feature adoption, support tickets) are increasing or decreasing a customer's churn risk.
- **AI-Generated Recommendations**: Context-aware suggested actions for customer success managers, with an approve/reject workflow.
- **Automated Outreach Generation**: AI drafts personalized emails addressing the specific churn drivers. Requires human review before sending.
- **What-If Simulator**: Interactive sliders allowing users to model how improvements in engagement or feature usage would impact the churn probability of a specific customer.
- **Data Management Workflow**: A multi-step stepper for uploading datasets (CSV/Excel), validation, column mapping, and triggering predictions.
- **AI Assistant**: An integrated chat interface to query retention data, summarize risks, and draft emails.
- **Mock/Real API Toggle**: The frontend can run completely offline using an extensive suite of mock data or connect to a real FastAPI backend via environment variables.

## 3. Technology Stack

| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Language** | JavaScript (ES6+) | Primary language for the React application. |
| **Frontend Framework** | React 18 & Vite | Fast development environment, modern component-based architecture. |
| **Styling** | Tailwind CSS v3 | Utility-first CSS for rapid, consistent, and highly customizable design. |
| **Routing** | React Router v6 | Client-side routing, protected routes, and lazy loading. |
| **State Management**| React Context API | Global state (Auth, App/UI state) without external dependencies. |
| **Data Visualization**| Recharts | Responsive, composable charting for metrics and analytics. |
| **Animation** | Framer Motion | Fluid micro-interactions, page transitions, and UI animations. |
| **Icons** | Lucide React | Clean, consistent iconography used throughout the application. |
| **Form Handling** | React Hook Form & Zod | Form state management and schema-based validation. |

*Architectural Choice Note:* React + Vite was chosen for optimal developer experience and build performance. Tailwind CSS is used to enforce a strict design system without the overhead of heavy UI libraries. Framer Motion is utilized to meet the "premium, enterprise-grade" aesthetic requirements through subtle animations.

## 4. Installation and Setup

### Prerequisites
- **Node.js**: v18.x or higher
- **npm**: v9.x or higher

### Environment Variables
Create a `.env` file in the root of the project.

| Variable | Required | Description | Example |
| :--- | :--- | :--- | :--- |
| `VITE_USE_MOCK_API` | No | Toggles between mock data (`true`) and real backend (`false`). | `true` |
| `VITE_API_BASE_URL` | No | URL of the backend API (if `VITE_USE_MOCK_API=false`). | `http://localhost:8000/api` |

### Installation Steps

1. **Clone the repository** (if applicable):
   ```bash
   git clone <repository-url>
   cd Antigravity_workspace
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the development server**:
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:5173`.

### Running the Application
- **Development Mode**: `npm run dev` starts the Vite dev server with Hot Module Replacement (HMR).
- **Production Build**: `npm run build` compiles the application into static files in the `dist` directory.
- **Mock Mode**: Ensure `VITE_USE_MOCK_API=true` is set. You can log in with any credentials or use the demo credentials (`demo@churnguard.ai` / `demo2026`).
=======
# ChurnGuard 

AI-powered customer retention intelligence system — predicts which customers are likely to churn, explains *why* using SHAP, and surfaces both through a dashboard, instead of handing Customer Success teams a bare risk score with no context.

## Problem

SaaS and telecom companies lose customers who quietly disengage before cancelling. Most churn tools output a risk score without explaining what's driving it or what to do about it, so Customer Success teams react late, with generic offers, after the customer has already decided to leave. ChurnGuard closes that gap: **Predict → Explain → Serve**.

## Tech Stack

**ML**
- LightGBM, CatBoost, PyTorch-TabNet — base models in a stacking ensemble
- Logistic Regression — meta-learner
- scikit-learn, Optuna (hyperparameter tuning), SHAP (explainability)

**Backend**
- FastAPI — `/predict`, `/explain`, `/model-performance` endpoints
- PostgreSQL / SQLite — prediction history

**Frontend**
- Next.js — churn-risk customer list, per-customer explanation view, model performance dashboard

**Deployment**
- Docker Compose

**Dataset**
- [IBM Telco Customer Churn](https://www.kaggle.com/datasets/yeanzc/telco-customer-churn-ibm-dataset) (Kaggle) — used for prototyping
>>>>>>> 684a4dbf8422698864f2c5573ae13887aad8073e
