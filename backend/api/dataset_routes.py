"""
The real API the frontend calls once VITE_USE_MOCK_API=false: dataset
upload/validate/map/predict, dashboard aggregates, customers, per-customer
SHAP explanation, rule-based recommendations, and LLM-drafted outreach.
Orchestrates backend/generic/{trainer,predictor,explainer,preprocessing}.py
-- no new ML logic lives here.

Response shapes intentionally mirror what services/api.js's mock branch
already returned, so no frontend contract changes are needed beyond
pointing at these URLs.
"""
import math
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from ..generic import predictor as generic_predictor
from ..generic import preprocessing as generic_preprocessing
from ..generic import trainer as generic_trainer
from ..generic.explainer import explain_customer, explain_high_risk_batch
from ..generic.io_utils import load_dataset_from_bytes
from ..llm import explain_generator, outreach_generator
from . import profiling, recommendations, schema, store
from .store import DatasetEntry

router = APIRouter(prefix="/api", tags=["churnguard"])

# Kept modest so the synchronous /predict request (Optuna tuning + a stacked
# ensemble fit + a batch SHAP pass) finishes in a reasonable time for an
# interactive prototype call rather than the library's full 30-trial default.
PREDICT_N_TRIALS = 15
TOP_DRIVERS_SAMPLE_CAP = 60
TOP_DRIVERS_NSAMPLES = 30

MODEL_FEATURE_KEYS = ["tenure", "monthly_charges", "contract_type"]
OPTIONAL_FEATURE_KEYS = ["total_charges", "service_tier", "payment_method"]
NUMERIC_FEATURE_KEYS = {"tenure", "monthly_charges", "total_charges"}


# ---------------------------------------------------------------- helpers --

def _current_or_404() -> DatasetEntry:
    entry = store.get_current()
    if entry is None:
        raise HTTPException(404, "No dataset connected yet. Upload one first.")
    return entry


def _dataset_or_404(dataset_id: str) -> DatasetEntry:
    entry = store.get_dataset(dataset_id)
    if entry is None:
        raise HTTPException(404, "That upload is no longer available. Please select your file again.")
    return entry


def _risk_tier(probability_pct: float) -> str:
    if probability_pct >= 80:
        return "critical"
    if probability_pct >= 60:
        return "high"
    if probability_pct >= 35:
        return "medium"
    return "low"


def _to_native(value: Any) -> Any:
    if isinstance(value, (np.generic,)):
        return value.item()
    if isinstance(value, float) and math.isnan(value):
        return None
    return value


def _safe_num(value: Any) -> Optional[float]:
    try:
        v = float(value)
        return None if math.isnan(v) else round(v, 2)
    except (TypeError, ValueError):
        return None


def _driver_description(feature_key: str, value: Any, shap_value: float) -> str:
    direction = "raises" if shap_value > 0 else "lowers"
    label = schema.pretty_feature_name(feature_key)
    return f"{label} of {value} {direction} this account's churn risk."


# ---------------------------------------------------------- upload/validate

@router.post("/datasets/upload")
async def upload_dataset(file: UploadFile = File(...)):
    contents = await file.read()
    try:
        df = load_dataset_from_bytes(file.filename, contents)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    if df.shape[1] == 0:
        raise HTTPException(400, "That file appears to be empty. Export your customer list again and make sure it has a header row plus at least one customer.")
    if df.shape[1] < 2:
        raise HTTPException(400, "We couldn't split that file into columns. Check that the first row names each column, and that a CSV export used commas as the separator.")
    if df.shape[0] == 0:
        raise HTTPException(400, "This file has column headers but no customer rows. Check that the export actually included your data, then upload it again.")

    # Stringify for profiling so missing-value detection matches the
    # token-based rule the frontend used to apply client-side (see
    # profiling.is_missing_value); the real (typed) df stays in raw_df.
    profile = profiling.profile_dataframe(df.astype(str).where(df.notna(), ""))

    dataset_id = f"DS-{int(time.time() * 1000)}"
    entry = DatasetEntry(id=dataset_id, filename=file.filename or "dataset", size=len(contents), raw_df=df, profile=profile)
    store.create_dataset(entry)

    return {
        "id": dataset_id,
        "filename": entry.filename,
        "rows": profile["rowCount"],
        "columns": profile["columnCount"],
        "size": entry.size,
        "sheetName": None,
        "sheetCount": None,
        "uploadDate": datetime.now(timezone.utc).isoformat(),
        "status": "uploaded",
    }


@router.post("/datasets/{dataset_id}/validate")
def validate_dataset(dataset_id: str):
    entry = _dataset_or_404(dataset_id)
    suggested = schema.suggest_mappings(list(entry.raw_df.columns))
    return profiling.build_validation_report(dataset_id, entry.profile, suggested)


class MapColumnsRequest(BaseModel):
    mappings: Dict[str, str]  # { yourColumnName: churnguardFieldKey }


@router.post("/datasets/{dataset_id}/map-columns")
def map_columns(dataset_id: str, body: MapColumnsRequest):
    entry = _dataset_or_404(dataset_id)
    mapped_field_keys = set(body.mappings.values())
    missing = [f for f in schema.REQUIRED_FIELDS if f["key"] not in mapped_field_keys]
    if missing:
        raise HTTPException(400, f"Still missing a column for {', '.join(f['label'] for f in missing)}.")
    entry.mappings = dict(body.mappings)
    return {"datasetId": dataset_id, "mappings": entry.mappings, "status": "mapped"}


# ------------------------------------------------------------------ predict

def _compute_top_drivers(model_df: pd.DataFrame, feature_cols: List[str]) -> List[Dict[str, Any]]:
    try:
        sample = model_df.sample(n=min(TOP_DRIVERS_SAMPLE_CAP, len(model_df)), random_state=42)
        scaled = generic_predictor.preprocess(sample[feature_cols])
        result = explain_high_risk_batch(scaled, threshold=0.0, nsamples=TOP_DRIVERS_NSAMPLES)
        shap_cols = [c for c in result.columns if c not in ("churn_probability", "base_value")]

        drivers = []
        for col in shap_cols:
            mean_signed = float(result[col].mean())
            mean_abs = float(result[col].abs().mean())
            drivers.append({
                "driver": schema.pretty_feature_name(col),
                "impact": round(mean_signed, 4),
                "direction": "positive" if mean_signed >= 0 else "negative",
                "customers": int((result[col] > 0).sum()) if mean_signed >= 0 else int((result[col] < 0).sum()),
                "_abs": mean_abs,
            })
        drivers.sort(key=lambda d: d["_abs"], reverse=True)
        for d in drivers:
            d.pop("_abs")
        return drivers
    except Exception:
        # Explainability is a value-add on top of a successful training run --
        # never fail the whole /predict call because the SHAP aggregate
        # (a real but best-effort computation) had trouble.
        return []


@router.post("/datasets/{dataset_id}/predict")
def run_prediction(dataset_id: str):
    entry = _dataset_or_404(dataset_id)
    if not entry.mappings:
        raise HTTPException(400, "Map your columns before running predictions.")

    field_to_col = {field_key: col for col, field_key in entry.mappings.items() if field_key}
    if "customer_id" not in field_to_col or "churn" not in field_to_col:
        raise HTTPException(400, "Customer ID and Churn label must both be mapped before predicting.")

    df = entry.raw_df.rename(columns={col: field_key for field_key, col in field_to_col.items()})

    present_optional = [f for f in OPTIONAL_FEATURE_KEYS if f in field_to_col]
    feature_cols = MODEL_FEATURE_KEYS + present_optional
    missing_features = [f for f in feature_cols if f not in df.columns]
    if missing_features:
        raise HTTPException(400, f"Missing mapped column(s) in the uploaded file: {missing_features}")

    model_df = df[["customer_id", "churn"] + feature_cols].copy()
    model_df["customer_id"] = model_df["customer_id"].astype(str)

    for numeric_key in NUMERIC_FEATURE_KEYS & set(feature_cols):
        model_df[numeric_key] = pd.to_numeric(
            model_df[numeric_key].astype(str).str.replace(r"[^0-9.\-]", "", regex=True), errors="coerce"
        )

    train_df = model_df.drop(columns=["customer_id"])
    try:
        report = generic_trainer.train_generic_model(train_df, target_col="churn", n_trials=PREDICT_N_TRIALS)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    predict_input = model_df[feature_cols]
    try:
        predictions = generic_predictor.predict(predict_input)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    positive_label = report["positive_label"]

    customers: List[Dict[str, Any]] = []
    customers_by_id: Dict[str, Dict[str, Any]] = {}
    raw_features_by_id: Dict[str, Dict[str, Any]] = {}
    labelled_churn_count = 0

    for idx in model_df.index:
        cid = model_df.at[idx, "customer_id"]
        proba_pct = round(float(predictions.at[idx, "churn_probability"]) * 100, 1)
        tier = _risk_tier(proba_pct)
        monthly = _safe_num(model_df.at[idx, "monthly_charges"]) if "monthly_charges" in feature_cols else None

        raw_churn_value = model_df.at[idx, "churn"]
        if profiling.is_missing_value(raw_churn_value):
            churned = None
        else:
            churned = bool(raw_churn_value == positive_label)
            if churned:
                labelled_churn_count += 1

        record = {
            "id": cid,
            "tenure": _safe_num(model_df.at[idx, "tenure"]),
            "monthlyCharges": monthly,
            "totalCharges": _safe_num(model_df.at[idx, "total_charges"]) if "total_charges" in feature_cols else None,
            "contractType": _to_native(model_df.at[idx, "contract_type"]),
            "serviceTier": _to_native(model_df.at[idx, "service_tier"]) if "service_tier" in feature_cols else None,
            "paymentMethod": _to_native(model_df.at[idx, "payment_method"]) if "payment_method" in feature_cols else None,
            "churnProbability": proba_pct,
            "riskTier": tier,
            "status": "at-risk" if tier in ("high", "critical") else "active",
            "revenueAtRisk": round((monthly or 0) * 12 * (proba_pct / 100), 2),
            "churned": churned,
        }
        customers.append(record)
        customers_by_id[cid] = record
        raw_features_by_id[cid] = {k: model_df.at[idx, k] for k in feature_cols}

    entry.customers = customers
    entry.customers_by_id = customers_by_id
    entry.raw_features_by_id = raw_features_by_id
    entry.training_report = report
    entry.trained = True
    entry.raw_drivers = {}
    entry.explanation_base_value = {}
    entry.ai_explanations = {}
    entry.outreach_drafts = []
    entry.top_drivers = _compute_top_drivers(model_df, feature_cols)

    return {
        "datasetId": dataset_id,
        "status": "completed",
        "customersProcessed": len(customers),
        "fieldsMapped": len(field_to_col),
        "labelledChurnCount": labelled_churn_count,
        "simulated": False,
        "trainingMetrics": {
            "accuracy": report["test_metrics"]["accuracy"],
            "precision": report["test_metrics"]["precision"],
            "recall": report["test_metrics"]["recall"],
            "f1": report["test_metrics"]["f1"],
            "rocAuc": report["test_metrics"]["roc_auc"],
        },
    }


# ----------------------------------------------------------------- dashboard

@router.get("/dashboard")
def get_dashboard():
    entry = _current_or_404()
    customers = entry.customers
    total = len(customers)
    at_risk = [c for c in customers if c["riskTier"] in ("high", "critical")]
    avg_risk = round(sum(c["churnProbability"] for c in customers) / total, 1) if total else 0
    revenue_at_risk = round(sum(c["revenueAtRisk"] for c in at_risk), 2)

    labelled = [c for c in customers if c["churned"] is not None]
    retention_rate = round(100 - (sum(1 for c in labelled if c["churned"]) / len(labelled) * 100), 1) if labelled else None

    kpis = {
        "totalCustomers": {"value": total},
        "customersAtRisk": {"value": len(at_risk)},
        "avgChurnRisk": {"value": avg_risk},
        "revenueAtRisk": {"value": revenue_at_risk},
    }
    if retention_rate is not None:
        kpis["retentionRate"] = {"value": retention_rate}

    return {"kpis": kpis, "sparklines": {}}


@router.get("/dashboard/risk-distribution")
def get_risk_distribution():
    entry = _current_or_404()
    colors = {"low": "#4ADE80", "medium": "#FBBF24", "high": "#F97316", "critical": "#EF4444"}
    labels = {"low": "Low Risk", "medium": "Medium Risk", "high": "High Risk", "critical": "Critical"}
    counts = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    for c in entry.customers:
        counts[c["riskTier"]] += 1
    return [{"name": labels[t], "value": counts[t], "color": colors[t]} for t in ("low", "medium", "high", "critical")]


@router.get("/dashboard/churn-trend")
def get_churn_trend():
    # A single uploaded dataset is a snapshot, not a time series -- there is
    # no real month-by-month history to report. See PROJECT_MEMORY.md.
    _current_or_404()
    return []


@router.get("/dashboard/revenue-at-risk")
def get_revenue_at_risk_trend():
    _current_or_404()
    return []


@router.get("/dashboard/top-drivers")
def get_top_drivers():
    entry = _current_or_404()
    return entry.top_drivers or []


def _tenure_bucket(months: Optional[float]) -> Optional[str]:
    if months is None:
        return None
    if months < 6:
        return "0-6 months"
    if months < 12:
        return "6-12 months"
    if months < 24:
        return "1-2 years"
    if months < 36:
        return "2-3 years"
    return "3+ years"


@router.get("/dashboard/segmentation")
def get_segmentation():
    entry = _current_or_404()
    customers = entry.customers

    def _group(key_fn, order: Optional[List[str]] = None):
        buckets: Dict[str, List[Dict]] = {}
        for c in customers:
            key = key_fn(c)
            if key is None:
                continue
            buckets.setdefault(key, []).append(c)
        keys = order or list(buckets.keys())
        out = []
        for key in keys:
            group = buckets.get(key, [])
            if not group:
                continue
            at_risk = sum(1 for c in group if c["riskTier"] in ("high", "critical"))
            avg_risk = round(sum(c["churnProbability"] for c in group) / len(group), 1)
            out.append({"segment": key, "total": len(group), "atRisk": at_risk, "avgRisk": avg_risk})
        return out

    by_contract = _group(lambda c: c["contractType"])
    by_tenure = _group(lambda c: _tenure_bucket(c["tenure"]), order=["0-6 months", "6-12 months", "1-2 years", "2-3 years", "3+ years"])
    by_service_tier = _group(lambda c: c["serviceTier"])

    return {"byPlan": by_contract, "byTenure": by_tenure, "byServiceTier": by_service_tier}


# ----------------------------------------------------------------- customers

@router.get("/customers")
def list_customers(
    search: Optional[str] = None,
    risk: Optional[str] = None,
    status: Optional[str] = None,
    sortBy: str = "churnProbability",
    sortDir: str = "desc",
    page: int = 1,
    limit: int = 10,
):
    entry = _current_or_404()
    filtered = entry.customers

    if search:
        s = search.lower()
        filtered = [c for c in filtered if s in str(c["id"]).lower()]
    if risk and risk != "all":
        filtered = [c for c in filtered if c["riskTier"] == risk]
    if status and status != "all":
        filtered = [c for c in filtered if c["status"] == status]

    if sortBy:
        reverse = sortDir == "desc"

        def sort_key(c):
            v = c.get(sortBy)
            return (v is None, v if v is not None else "")

        filtered = sorted(filtered, key=sort_key, reverse=reverse)

    total = len(filtered)
    start = (page - 1) * limit
    paginated = filtered[start:start + limit] if limit else filtered

    return {
        "customers": paginated,
        "total": total,
        "page": page,
        "totalPages": max(1, math.ceil(total / limit)) if limit else 1,
    }


@router.get("/customers/{customer_id}")
def get_customer(customer_id: str):
    entry = _current_or_404()
    customer = entry.customers_by_id.get(customer_id)
    if customer is None:
        raise HTTPException(404, "Customer not found")
    return customer


def _ensure_drivers(entry: DatasetEntry, customer_id: str) -> List[Dict[str, Any]]:
    """Raw drivers: [{feature: snake_case, value: native, shap_value: float}],
    sorted by |shap_value| desc, computed once and cached."""
    if customer_id in entry.raw_drivers:
        return entry.raw_drivers[customer_id]

    raw_features = entry.raw_features_by_id.get(customer_id)
    if raw_features is None:
        raise HTTPException(404, "Customer not found")
    if entry.training_report is None:
        raise HTTPException(503, "Dataset has not been processed yet.")

    raw_df = pd.DataFrame([raw_features])
    try:
        scaled = generic_predictor.preprocess(raw_df)
        explanation = explain_customer(scaled)
    except FileNotFoundError as exc:
        raise HTTPException(503, "Model not trained yet.") from exc

    metadata = entry.training_report
    human_df = generic_preprocessing.select_and_order_features(raw_df, list(explanation.feature_names))
    human_df = generic_preprocessing.impute_numeric(human_df, metadata["numeric_medians"])
    human_df = generic_preprocessing.impute_categorical(human_df, metadata["categorical_cols"], metadata["categorical_placeholder"])
    human_row = human_df.iloc[0]

    drivers = sorted(
        [
            {"feature": name, "value": _to_native(human_row[name]), "shap_value": float(v)}
            for name, v in zip(explanation.feature_names, explanation.values[0])
        ],
        key=lambda d: abs(d["shap_value"]),
        reverse=True,
    )
    entry.raw_drivers[customer_id] = drivers
    entry.explanation_base_value[customer_id] = float(explanation.base_values[0])
    return drivers


@router.get("/customers/{customer_id}/explanation")
def get_explanation(customer_id: str):
    entry = _current_or_404()
    customer = entry.customers_by_id.get(customer_id)
    if customer is None:
        raise HTTPException(404, "Customer not found")

    drivers = _ensure_drivers(entry, customer_id)
    top5 = drivers[:5]
    features_out = [
        {
            "feature": schema.pretty_feature_name(d["feature"]),
            "value": str(d["value"]),
            "contribution": round(d["shap_value"], 4),
            "direction": "increases" if d["shap_value"] > 0 else "decreases",
            "description": _driver_description(d["feature"], d["value"], d["shap_value"]),
        }
        for d in top5
    ]

    if customer_id not in entry.ai_explanations:
        try:
            pretty_drivers = [{"feature": f["feature"], "value": f["value"], "contribution": f["contribution"]} for f in features_out]
            result = explain_generator.generate_explanation_summary(customer_id, customer["churnProbability"], pretty_drivers)
            entry.ai_explanations[customer_id] = result["summary"]
        except RuntimeError:
            pass  # no LLM provider configured -- frontend renders without it

    return {
        "customerId": customer_id,
        "churnProbability": customer["churnProbability"],
        "baselineRisk": round(entry.explanation_base_value.get(customer_id, 0) * 100, 1),
        "features": features_out,
        "aiExplanation": entry.ai_explanations.get(customer_id),
    }


@router.get("/customers/{customer_id}/recommendations")
def get_recommendations(customer_id: str):
    entry = _current_or_404()
    if entry.customers_by_id.get(customer_id) is None:
        raise HTTPException(404, "Customer not found")
    drivers = _ensure_drivers(entry, customer_id)
    return recommendations.build_recommendations(customer_id, drivers)


class UpdateRecommendationStatus(BaseModel):
    status: str


@router.put("/recommendations/{rec_id}")
def update_recommendation_status(rec_id: str, body: UpdateRecommendationStatus):
    # Recommendations are derived on the fly, not persisted server-side --
    # accepting the status change here just acknowledges it for the UI,
    # matching the mock layer's behaviour.
    return {"id": rec_id, "status": body.status}


# ----------------------------------------------------------------- outreach

@router.get("/outreach")
def list_outreach():
    entry = _current_or_404()
    return entry.outreach_drafts


@router.post("/customers/{customer_id}/outreach/generate")
def generate_outreach(customer_id: str):
    entry = _current_or_404()
    customer = entry.customers_by_id.get(customer_id)
    if customer is None:
        raise HTTPException(404, "Customer not found")

    drivers = _ensure_drivers(entry, customer_id)
    pretty_drivers = [
        {"feature": schema.pretty_feature_name(d["feature"]), "value": d["value"], "shap_value": d["shap_value"]}
        for d in drivers[:5]
    ]

    try:
        result = outreach_generator.generate_outreach_message(
            customer_id, customer["churnProbability"] / 100, pretty_drivers
        )
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc

    now = datetime.now(timezone.utc).isoformat()
    draft = {
        "id": f"OUT-{int(time.time() * 1000)}",
        "customerId": customer_id,
        "customerName": customer_id,
        "contactName": None,
        "contactEmail": None,
        "subject": f"A quick check-in about your account",
        "body": result["message"],
        "status": "draft",
        "tone": "professional",
        "createdAt": now,
        "updatedAt": now,
        "auditTrail": [{"action": f"AI generated draft ({result['provider']})", "user": "System", "timestamp": now}],
    }
    entry.outreach_drafts.insert(0, draft)
    return draft


class UpdateOutreachRequest(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None
    status: Optional[str] = None


def _find_draft(entry: DatasetEntry, email_id: str) -> Dict[str, Any]:
    draft = next((d for d in entry.outreach_drafts if d["id"] == email_id), None)
    if draft is None:
        raise HTTPException(404, "Outreach draft not found")
    return draft


@router.put("/outreach/{email_id}")
def update_outreach(email_id: str, body: UpdateOutreachRequest):
    entry = _current_or_404()
    draft = _find_draft(entry, email_id)
    if body.subject is not None:
        draft["subject"] = body.subject
    if body.body is not None:
        draft["body"] = body.body
    draft["status"] = "reviewed"
    draft["updatedAt"] = datetime.now(timezone.utc).isoformat()
    return draft


@router.post("/outreach/{email_id}/approve")
def approve_outreach(email_id: str):
    entry = _current_or_404()
    draft = _find_draft(entry, email_id)
    draft["status"] = "approved"
    draft["auditTrail"].append({"action": "Approved", "user": "You", "timestamp": datetime.now(timezone.utc).isoformat()})
    return {"id": email_id, "status": "approved"}


@router.post("/outreach/{email_id}/send")
def send_outreach(email_id: str):
    entry = _current_or_404()
    draft = _find_draft(entry, email_id)
    draft["status"] = "sent"
    draft["auditTrail"].append({"action": "Marked as sent", "user": "You", "timestamp": datetime.now(timezone.utc).isoformat()})
    return {"id": email_id, "status": "sent"}
