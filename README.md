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
