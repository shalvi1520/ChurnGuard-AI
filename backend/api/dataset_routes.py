"""
The API the frontend runs on: dataset connect/validate/map/predict, dashboard
aggregates, customers, per-customer SHAP explanation, rule-based
recommendations, and LLM-drafted outreach.

Orchestrates backend/generic/{trainer,predictor,explainer,preprocessing}.py --
no new ML logic lives here.

Note the LLM imports are deliberately made inside the two functions that need
them, not at module scope: outreach drafting and the plain-English explanation
are optional extras, and a missing langchain install must not stop the whole
churn pipeline (upload, train, predict, dashboard) from working.
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
from ..generic import explainer as generic_explainer
from ..generic import trainer as generic_trainer
from ..generic.explainer import explain_customer, explain_high_risk_batch
from ..generic.io_utils import load_dataset_from_bytes
from . import ingest, profiling, recommendations, schema, store
from .store import DatasetEntry, DatasetSource

router = APIRouter(prefix="/api", tags=["churnguard"])

# Kept modest so the synchronous /predict request (Optuna tuning + a stacked
# ensemble fit + a batch SHAP pass) finishes in a reasonable time for an
# interactive call rather than the library's full 30-trial default.
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
        raise HTTPException(404, "No dataset connected yet. Connect one first.")
    return entry


def _trained_or_409(entry: DatasetEntry) -> DatasetEntry:
    if not entry.trained:
        raise HTTPException(409, "This dataset hasn't been processed yet. Finish data setup first.")
    return entry


def _dataset_or_404(dataset_id: str) -> DatasetEntry:
    entry = store.get_dataset(dataset_id)
    if entry is None:
        raise HTTPException(404, "That dataset is no longer available. Please connect your data again.")
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


# ------------------------------------------------------------------- status

@router.get("/health")
def health() -> Dict[str, Any]:
    """Lets the frontend tell "the backend isn't running" apart from "the
    backend is fine but nothing is connected yet" -- two very different
    messages for the user."""
    entry = store.get_current()
    return {
        "status": "ok",
        "schemaVersion": schema.SCHEMA_VERSION,
        "dataset": entry.summary() if entry else None,
    }


@router.get("/dataset")
def current_dataset() -> Dict[str, Any]:
    return _current_or_404().summary()


@router.delete("/dataset")
def clear_dataset() -> Dict[str, Any]:
    """"Replace dataset" -- drops the stored data so a trained model can never
    outlive the dataset it was built from."""
    store.reset()
    return {"status": "cleared"}


# ---------------------------------------------------------- connect/validate

SUPPORTED_UPLOAD_EXTENSIONS = (".csv", ".xlsx", ".xls")


@router.post("/datasets/upload")
async def upload_dataset(file: UploadFile = File(...)):
    """Reads the file server-side (pandas) and registers it as the active
    dataset. Every failure below is phrased for the person who chose the file --
    a raw pandas message like "No columns to parse from file" tells them
    nothing about what to do next."""
    filename = file.filename or "dataset"
    if not filename.lower().endswith(SUPPORTED_UPLOAD_EXTENSIONS):
        raise HTTPException(400, "That file type isn't supported. Upload a CSV, XLSX or XLS file.")

    contents = await file.read()
    if not contents.strip():
        raise HTTPException(
            400,
            "That file is empty. Export your customer list again and make sure it has a header row plus at "
            "least one customer.",
        )

    try:
        df = load_dataset_from_bytes(filename, contents)
    except pd.errors.EmptyDataError as exc:
        raise HTTPException(
            400,
            "That file has no readable columns. Check that the first row names each column, then upload it again.",
        ) from exc
    except Exception as exc:  # noqa: BLE001 -- pandas raises many unrelated types on a corrupt file
        raise HTTPException(
            400,
            "We couldn't read that file. It may be corrupted or saved in a different format than its extension "
            "suggests. Re-export it as CSV, XLSX or XLS and try again.",
        ) from exc

    try:
        entry = ingest.register_dataframe(
            df,
            filename=filename,
            size=len(contents),
            source=DatasetSource(kind="upload", label="Uploaded file", detail=filename),
        )
    except ingest.IngestError as exc:
        raise ingest.as_http_error(exc) from exc

    return ingest.describe_entry(entry)


@router.post("/datasets/{dataset_id}/validate")
def validate_dataset(dataset_id: str):
    """Profiles the data, runs automatic column matching, and reports what was
    found. This is the one call the setup flow needs before it can decide
    whether to process automatically or ask the user something."""
    entry = _dataset_or_404(dataset_id)
    return profiling.build_validation_report(dataset_id, entry.profile)


class MapColumnsRequest(BaseModel):
    mappings: Dict[str, str]  # { yourColumnName: churnguardFieldKey }


@router.post("/datasets/{dataset_id}/map-columns")
def map_columns(dataset_id: str, body: MapColumnsRequest):
    entry = _dataset_or_404(dataset_id)

    unknown = [c for c in body.mappings if c not in entry.raw_df.columns]
    if unknown:
        raise HTTPException(400, f"These columns aren't in the connected data: {', '.join(unknown)}.")

    mapped_field_keys = set(body.mappings.values())
    missing = [f for f in schema.REQUIRED_FIELDS if f["key"] not in mapped_field_keys]
    if missing:
        first = missing[0]
        raise HTTPException(
            400,
            f"{first['label']} still needs a column. {first['whyNeeded']} {first['lookFor']}",
        )

    entry.mappings = dict(body.mappings)
    return {"datasetId": dataset_id, "mappings": entry.mappings, "status": "mapped"}


# ------------------------------------------------------------------ predict

def _clean_model_frame(
    model_df: pd.DataFrame, feature_cols: List[str]
) -> tuple[pd.DataFrame, List[Dict[str, Any]]]:
    """Safe, reportable preprocessing. Every entry in the returned list
    describes something that actually happened to this dataset -- the UI states
    them verbatim, so nothing may be added here speculatively."""
    actions: List[Dict[str, Any]] = []

    # 1. Whitespace. " Month-to-month" and "Month-to-month" are one category.
    text_cols = [c for c in model_df.columns if model_df[c].dtype == object]
    trimmed = 0
    for col in text_cols:
        original = model_df[col]
        stripped = original.astype(str).str.strip()
        trimmed += int((stripped != original.astype(str)).sum())
        model_df[col] = stripped
    if trimmed:
        actions.append({
            "action": "whitespace",
            "count": trimmed,
            "detail": f"Trimmed stray spaces from {trimmed:,} values so they group correctly.",
        })

    # 2. Numbers written as text: "$1,299.50", "45 ", "1 299".
    for key in NUMERIC_FEATURE_KEYS & set(feature_cols):
        before = model_df[key].copy()
        model_df[key] = pd.to_numeric(
            before.astype(str).str.replace(r"[^0-9.\-]", "", regex=True).replace("", np.nan),
            errors="coerce",
        )
        was_blank = before.astype(str).str.strip().str.lower().isin(profiling.MISSING_TOKENS)
        unreadable = int((model_df[key].isna() & ~was_blank).sum())
        if unreadable:
            actions.append({
                "action": "numeric",
                "count": unreadable,
                "detail": f"{unreadable:,} {schema.pretty_feature_name(key)} value(s) weren't readable as numbers "
                          "and are treated as missing.",
            })

    # 3. Rows with no churn outcome can't teach the model anything.
    churn_missing = model_df["churn"].map(profiling.is_missing_value)
    if churn_missing.any():
        count = int(churn_missing.sum())
        model_df = model_df.loc[~churn_missing]
        actions.append({
            "action": "missing-label",
            "count": count,
            "detail": f"{count:,} row(s) had no churn outcome recorded and were excluded from training.",
        })

    # 4. Exact duplicates would count one customer more than once.
    duplicates = model_df.duplicated()
    if duplicates.any():
        count = int(duplicates.sum())
        model_df = model_df.loc[~duplicates]
        actions.append({
            "action": "duplicate-rows",
            "count": count,
            "detail": f"{count:,} duplicate row(s) detected and excluded from model training.",
        })

    # 5. The same customer ID twice: keep the first, so risk scores stay 1:1.
    repeated_ids = model_df.duplicated(subset=["customer_id"])
    if repeated_ids.any():
        count = int(repeated_ids.sum())
        model_df = model_df.loc[~repeated_ids]
        actions.append({
            "action": "duplicate-ids",
            "count": count,
            "detail": f"{count:,} row(s) repeated a customer ID; the first record for each was kept.",
        })

    return model_df, actions


def _check_churn_column(model_df: pd.DataFrame, column_name: str) -> None:
    """Caught here rather than deep inside the trainer, so the message names
    the user's own column and says what a churn outcome has to look like."""
    summary = profiling.churn_label_summary(model_df["churn"].tolist())
    distinct = summary["distinct"]

    if len(distinct) < 2:
        raise HTTPException(
            400,
            f'Every customer has the same value in "{column_name}" '
            f'({distinct[0] if distinct else "no values at all"}), so there is no churn to learn from. '
            "Choose a column that records who has already left and who has stayed.",
        )
    if len(distinct) > 2:
        shown = ", ".join(distinct[:5]) + ("…" if len(distinct) > 5 else "")
        raise HTTPException(
            400,
            f'"{column_name}" holds {len(distinct)} different values ({shown}), but a churn outcome needs '
            "exactly two — such as Yes/No, 1/0 or Churned/Active. Choose a different column, or reduce that "
            "column to a two-value outcome in your export.",
        )

    smaller = min(summary["counts"].values())
    if smaller < 6:
        raise HTTPException(
            400,
            f'Only {smaller} customer(s) in "{column_name}" fall on one side of the outcome. ChurnGuard needs at '
            "least 6 examples of each so the model has a pattern to learn. Upload a dataset covering more history.",
        )


def _compute_top_drivers(model_df: pd.DataFrame, feature_cols: List[str]) -> List[Dict[str, Any]]:
    try:
        sample = model_df.sample(n=min(TOP_DRIVERS_SAMPLE_CAP, len(model_df)), random_state=42)
        scaled = generic_predictor.preprocess(sample[feature_cols])
        result = explain_high_risk_batch(scaled, threshold=0.0, nsamples=TOP_DRIVERS_NSAMPLES)
        shap_cols = [c for c in result.columns if c not in ("churn_probability", "base_value")]

        drivers = []
        for col in shap_cols:
            mean_signed = float(result[col].mean())
            drivers.append({
                "driver": schema.pretty_feature_name(col),
                "impact": round(mean_signed, 4),
                "direction": "positive" if mean_signed >= 0 else "negative",
                "customers": int((result[col] > 0).sum()) if mean_signed >= 0 else int((result[col] < 0).sum()),
                "_abs": float(result[col].abs().mean()),
            })
        drivers.sort(key=lambda d: d["_abs"], reverse=True)
        for d in drivers:
            d.pop("_abs")
        return drivers
    except Exception:  # noqa: BLE001
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
    for required_key in ("customer_id", "churn"):
        if required_key not in field_to_col:
            raise HTTPException(
                400, f"{schema.pretty_feature_name(required_key)} must be mapped before predicting."
            )

    df = entry.raw_df.rename(columns={col: field_key for field_key, col in field_to_col.items()})

    present_optional = [f for f in OPTIONAL_FEATURE_KEYS if f in field_to_col]
    feature_cols = MODEL_FEATURE_KEYS + present_optional
    missing_features = [f for f in feature_cols if f not in df.columns]
    if missing_features:
        labels = ", ".join(schema.pretty_feature_name(f) for f in missing_features)
        raise HTTPException(400, f"These mapped columns are missing from the connected data: {labels}.")

    model_df = df[["customer_id", "churn"] + feature_cols].copy()
    model_df["customer_id"] = model_df["customer_id"].astype(str).str.strip()

    model_df, cleaning = _clean_model_frame(model_df, feature_cols)
    if model_df.empty:
        raise HTTPException(400, "No usable customer rows were left after cleaning. Check the connected data.")

    _check_churn_column(model_df, field_to_col["churn"])

    train_df = model_df.drop(columns=["customer_id"])
    try:
        report = generic_trainer.train_generic_model(train_df, target_col="churn", n_trials=PREDICT_N_TRIALS)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    # Training has just written new artifacts to disk, but predictor/explainer
    # hold the previously-loaded model in module globals. Without this, a second
    # dataset in the same server process is scored by the FIRST dataset's model
    # -- new metrics get reported while every customer keeps the old risk score.
    generic_predictor.reset_cache()
    generic_explainer.reset_cache()

    try:
        predictions = generic_predictor.predict(model_df[feature_cols])
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
    entry.cleaning = cleaning
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
        "mappedFields": sorted(field_to_col),
        "labelledChurnCount": labelled_churn_count,
        "cleaning": cleaning,
        "source": entry.source.as_dict(),
        "trainingMetrics": {
            "accuracy": report["test_metrics"]["accuracy"],
            "precision": report["test_metrics"]["precision"],
            "recall": report["test_metrics"]["recall"],
            "f1": report["test_metrics"]["f1"],
            "rocAuc": report["test_metrics"]["roc_auc"],
        },
    }


# ----------------------------------------------------------------- dashboard

def _dataset_context(entry: DatasetEntry) -> Dict[str, Any]:
    """Tells the UI what this dataset can and can't support, so pages hide what
    they have no data for instead of showing an invented value (PART 21)."""
    mapped = entry.mapped_field_keys()
    return {
        "source": entry.source.as_dict(),
        "filename": entry.filename,
        "rows": entry.profile["rowCount"],
        "columns": entry.profile["columnCount"],
        "customers": len(entry.customers),
        "mappedFields": mapped,
        "available": {
            "revenue": "monthly_charges" in mapped,
            "totalCharges": "total_charges" in mapped,
            "serviceTier": "service_tier" in mapped,
            "paymentMethod": "payment_method" in mapped,
            "churnLabel": "churn" in mapped,
            # A single connected dataset is one snapshot: there is no history
            # to build a trend from, and we say so rather than inventing one.
            "history": False,
        },
    }


@router.get("/dashboard")
def get_dashboard():
    entry = _trained_or_409(_current_or_404())
    customers = entry.customers
    total = len(customers)
    at_risk = [c for c in customers if c["riskTier"] in ("high", "critical")]
    avg_risk = round(sum(c["churnProbability"] for c in customers) / total, 1) if total else 0
    revenue_at_risk = round(sum(c["revenueAtRisk"] for c in at_risk), 2)

    labelled = [c for c in customers if c["churned"] is not None]
    retention_rate = (
        round(100 - (sum(1 for c in labelled if c["churned"]) / len(labelled) * 100), 1) if labelled else None
    )

    kpis = {
        "totalCustomers": {"value": total},
        "customersAtRisk": {"value": len(at_risk)},
        "avgChurnRisk": {"value": avg_risk},
        "revenueAtRisk": {"value": revenue_at_risk},
    }
    if retention_rate is not None:
        kpis["retentionRate"] = {"value": retention_rate}

    return {"kpis": kpis, "sparklines": {}, "dataset": _dataset_context(entry)}


@router.get("/dashboard/risk-distribution")
def get_risk_distribution():
    entry = _trained_or_409(_current_or_404())
    colors = {"low": "#4ADE80", "medium": "#FBBF24", "high": "#F97316", "critical": "#EF4444"}
    labels = {"low": "Low Risk", "medium": "Medium Risk", "high": "High Risk", "critical": "Critical"}
    counts = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    for c in entry.customers:
        counts[c["riskTier"]] += 1
    return [{"name": labels[t], "value": counts[t], "color": colors[t]} for t in ("low", "medium", "high", "critical")]


@router.get("/dashboard/churn-trend")
def get_churn_trend():
    # A single connected dataset is a snapshot, not a time series -- there is
    # no real month-by-month history to report. See PROJECT_MEMORY.md.
    _trained_or_409(_current_or_404())
    return []


@router.get("/dashboard/revenue-at-risk")
def get_revenue_at_risk_trend():
    _trained_or_409(_current_or_404())
    return []


@router.get("/dashboard/top-drivers")
def get_top_drivers():
    entry = _trained_or_409(_current_or_404())
    return entry.top_drivers or []


@router.get("/dashboard/risk-by-value")
def get_risk_by_value():
    """Churn risk against what each account is worth per month -- the view that
    answers "which at-risk accounts actually matter". Computed from the real
    records, and only meaningful because monthly charges is a required field."""
    entry = _trained_or_409(_current_or_404())
    return [
        {
            "id": c["id"],
            "monthlyCharges": c["monthlyCharges"],
            "churnProbability": c["churnProbability"],
            "riskTier": c["riskTier"],
            "revenueAtRisk": c["revenueAtRisk"],
        }
        for c in entry.customers
        if c["monthlyCharges"] is not None
    ]


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
    entry = _trained_or_409(_current_or_404())
    customers = entry.customers

    def _group(key_fn, order: Optional[List[str]] = None):
        buckets: Dict[str, List[Dict]] = {}
        for c in customers:
            key = key_fn(c)
            if key is None or str(key).strip() == "":
                continue
            buckets.setdefault(str(key), []).append(c)
        keys = order or list(buckets.keys())
        out = []
        for key in keys:
            group = buckets.get(key, [])
            if not group:
                continue
            at_risk = sum(1 for c in group if c["riskTier"] in ("high", "critical"))
            avg_risk = round(sum(c["churnProbability"] for c in group) / len(group), 1)
            churned = [c for c in group if c["churned"] is not None]
            out.append({
                "segment": key,
                "total": len(group),
                "atRisk": at_risk,
                "avgRisk": avg_risk,
                "churnedRate": round(sum(1 for c in churned if c["churned"]) / len(churned) * 100, 1)
                if churned else None,
            })
        return out

    return {
        "byPlan": _group(lambda c: c["contractType"]),
        "byTenure": _group(
            lambda c: _tenure_bucket(c["tenure"]),
            order=["0-6 months", "6-12 months", "1-2 years", "2-3 years", "3+ years"],
        ),
        "byServiceTier": _group(lambda c: c["serviceTier"]),
        "byPaymentMethod": _group(lambda c: c["paymentMethod"]),
    }


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
    entry = _trained_or_409(_current_or_404())
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
    entry = _trained_or_409(_current_or_404())
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
        raise HTTPException(409, "This dataset hasn't been processed yet.")

    raw_df = pd.DataFrame([raw_features])
    try:
        scaled = generic_predictor.preprocess(raw_df)
        explanation = explain_customer(scaled)
    except FileNotFoundError as exc:
        raise HTTPException(503, "The trained model is no longer available. Re-run data setup.") from exc

    metadata = entry.training_report
    human_df = generic_preprocessing.select_and_order_features(raw_df, list(explanation.feature_names))
    human_df = generic_preprocessing.impute_numeric(human_df, metadata["numeric_medians"])
    human_df = generic_preprocessing.impute_categorical(
        human_df, metadata["categorical_cols"], metadata["categorical_placeholder"]
    )
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
    entry = _trained_or_409(_current_or_404())
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
            from ..llm import explain_generator  # optional extra -- see module docstring

            pretty = [
                {"feature": f["feature"], "value": f["value"], "contribution": f["contribution"]}
                for f in features_out
            ]
            result = explain_generator.generate_explanation_summary(
                customer_id, customer["churnProbability"], pretty
            )
            entry.ai_explanations[customer_id] = result["summary"]
        except (ImportError, RuntimeError):
            # No LLM provider configured, or langchain isn't installed. The
            # SHAP breakdown above is the real explanation either way; the
            # written summary is a convenience on top of it.
            pass

    return {
        "customerId": customer_id,
        "churnProbability": customer["churnProbability"],
        "baselineRisk": round(entry.explanation_base_value.get(customer_id, 0) * 100, 1),
        "features": features_out,
        "aiExplanation": entry.ai_explanations.get(customer_id),
    }


@router.get("/customers/{customer_id}/recommendations")
def get_recommendations(customer_id: str):
    entry = _trained_or_409(_current_or_404())
    if entry.customers_by_id.get(customer_id) is None:
        raise HTTPException(404, "Customer not found")
    drivers = _ensure_drivers(entry, customer_id)
    return recommendations.build_recommendations(customer_id, drivers)


class UpdateRecommendationStatus(BaseModel):
    status: str


@router.put("/recommendations/{rec_id}")
def update_recommendation_status(rec_id: str, body: UpdateRecommendationStatus):
    # Recommendations are derived on the fly, not persisted server-side --
    # accepting the status change here acknowledges it for the UI.
    return {"id": rec_id, "status": body.status}


# ----------------------------------------------------------------- outreach

@router.get("/outreach")
def list_outreach():
    entry = _trained_or_409(_current_or_404())
    return entry.outreach_drafts


@router.post("/customers/{customer_id}/outreach/generate")
def generate_outreach(customer_id: str):
    entry = _trained_or_409(_current_or_404())
    customer = entry.customers_by_id.get(customer_id)
    if customer is None:
        raise HTTPException(404, "Customer not found")

    drivers = _ensure_drivers(entry, customer_id)
    pretty_drivers = [
        {"feature": schema.pretty_feature_name(d["feature"]), "value": d["value"], "shap_value": d["shap_value"]}
        for d in drivers[:5]
    ]

    try:
        from ..llm import outreach_generator  # optional extra -- see module docstring
    except ImportError as exc:
        raise HTTPException(
            503,
            "Outreach drafting needs the optional LLM packages, which aren't installed on this server. "
            "Install backend/requirements.txt to enable it.",
        ) from exc

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
        "subject": "A quick check-in about your account",
        "body": result["message"],
        "status": "draft",
        "tone": "professional",
        "createdAt": now,
        "updatedAt": now,
        # What the draft was actually written from, so the review screen can
        # show it rather than asking the user to take the draft on trust.
        "basedOn": {
            "churnProbability": customer["churnProbability"],
            "drivers": [
                {"feature": d["feature"], "value": str(d["value"])} for d in pretty_drivers[:3]
            ],
        },
        "auditTrail": [
            {"action": f"AI generated draft ({result['provider']})", "user": "System", "timestamp": now}
        ],
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
    draft["auditTrail"].append(
        {"action": "Edited", "user": "You", "timestamp": draft["updatedAt"]}
    )
    return draft


@router.post("/outreach/{email_id}/approve")
def approve_outreach(email_id: str):
    entry = _current_or_404()
    draft = _find_draft(entry, email_id)
    draft["status"] = "approved"
    draft["auditTrail"].append(
        {"action": "Approved", "user": "You", "timestamp": datetime.now(timezone.utc).isoformat()}
    )
    return {"id": email_id, "status": "approved"}


@router.post("/outreach/{email_id}/send")
def send_outreach(email_id: str):
    """ChurnGuard has no email delivery integration: this records that *you*
    sent it from your own tools. It never contacts a customer."""
    entry = _current_or_404()
    draft = _find_draft(entry, email_id)
    draft["status"] = "sent"
    draft["auditTrail"].append(
        {"action": "Marked as sent", "user": "You", "timestamp": datetime.now(timezone.utc).isoformat()}
    )
    return {"id": email_id, "status": "sent"}
