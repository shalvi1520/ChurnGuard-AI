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
import logging
import math
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from ..agents import business_rules  # pure Python, no optional deps -- safe to import eagerly
from ..generic import artifact_registry
from ..generic import drift as drift_util
from ..generic import fingerprint as fingerprint_util
from ..generic import predictor as generic_predictor
from ..generic import preprocessing as generic_preprocessing
from ..generic import explainer as generic_explainer
from ..generic import schema_hash as schema_hash_util
from ..generic import trainer as generic_trainer
from ..generic import artifacts as generic_artifacts
from ..generic.explainer import explain_customer, explain_high_risk_batch
from ..generic.io_utils import load_dataset_from_bytes
from . import derive_label, ingest, mapping, profiling, recommendations, schema, store
from .store import DatasetEntry, DatasetSource

router = APIRouter(prefix="/api", tags=["churnguard"])
logger = logging.getLogger(__name__)

# The database is an optional extra (see main.py's _auth_router): a server
# with no DATABASE_URL/JWT_SECRET configured still runs the full churn
# pipeline, just without accounts, persisted dataset history, or skipping a
# retrain for a dataset it's already seen. Every use below is guarded by
# DB_AVAILABLE and wrapped so a database hiccup degrades to "train normally",
# never to a broken /predict.
try:
    from ..db.database import SessionLocal
    from ..db.models import Dataset as DatasetRow
    from ..db.models import TrainedModel
    from .auth_routes import get_current_user, get_current_user_optional

    DB_AVAILABLE = True
except Exception:  # noqa: BLE001 -- optional extra, see comment above
    DB_AVAILABLE = False

    def get_current_user_optional():
        return None

    def get_current_user():
        raise HTTPException(503, "Accounts need a database, which isn't configured on this server.")

# Kept modest so the synchronous /predict request (Optuna tuning + a stacked
# ensemble fit + a batch SHAP pass) finishes in a reasonable time for an
# interactive call rather than the library's full 30-trial default.
PREDICT_N_TRIALS = 15
TOP_DRIVERS_SAMPLE_CAP = 60
TOP_DRIVERS_NSAMPLES = 30

MODEL_FEATURE_KEYS = ["tenure"]
# `monthly_charges` and `contract_type` live here, not in MODEL_FEATURE_KEYS:
# not every business bills customers a flat recurring amount (a freemium/
# subscription-tier product may have no such column at all), and not every
# business has a contract/commitment-length concept at all (e-commerce, or
# any product with no formal plan term) -- both are required only when the
# data actually has them, see shared/churnguardFields.json's "required": false.
# `tenure` is the one feature kept unconditionally required: "how long has
# this account existed" is close to a universal churn signal across verticals,
# unlike a specific billing or contract structure.
OPTIONAL_FEATURE_KEYS = ["contract_type", "monthly_charges", "total_charges", "service_tier", "payment_method"]
NUMERIC_FEATURE_KEYS = {"tenure", "monthly_charges", "total_charges"}

# Why a customer's uploaded columns don't stop at the 6 ChurnGuard fields:
# generic_trainer.train_generic_model() already does real dtype/cardinality-
# based preprocessing on whatever columns it's given (see its own id-like/
# constant/high-cardinality/datetime auto-dropping) -- restricting it to only
# the mapped fields discarded every vertical-specific signal (a bank's
# `Balance`, an e-commerce dataset's `CashbackAmount`) that has no equivalent
# in the fixed schema. `_DROPPED_COLUMN_REASONS` turns the trainer's own
# `dropped_columns` report into the same plain-language style as `cleaning`.
_DROPPED_COLUMN_REASONS = {
    "id_like": "looks like an identifier, not a predictive feature",
    "constant_or_all_null": "the same value for every customer (or empty)",
    "datetime": "a date/time column, not used as a feature in this version",
    "high_cardinality_categorical": "too many distinct values to use as a category",
}


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


def _json_safe(obj: Any) -> Any:
    """Recursively converts numpy scalars/arrays to native Python types, and
    NaN/Infinity floats to None.

    Real root cause of a bug where dataset/prediction history silently never
    persisted: train_generic_model()'s report dict carries positive_label /
    negative_label straight from pandas' Series.unique(), which returns raw
    numpy.int64 (or similar) rather than a native int for an integer-coded
    churn column. SQLAlchemy's JSON column type has no numpy-aware encoder,
    so the INSERT raised TypeError -- and _persist_training()'s best-effort
    except-and-continue swallowed it completely, so training kept
    succeeding while history quietly stayed empty. Applied once, here, at
    the DB-write boundary, rather than chasing every place a numpy type
    could leak into a report dict upstream.

    NaN/Infinity get the same treatment for the same reason: Python's
    json.dumps happily emits the literal tokens NaN/Infinity by default
    (allow_nan=True), but those aren't valid JSON per spec, and Postgres's
    JSON column type rejects them outright at INSERT/UPDATE time. This bit
    specifically raw_features_by_id, which -- unlike the customer records in
    `predictions`, which already go through _safe_num()'s NaN-to-None
    conversion -- copies dataframe cell values directly and can carry a raw
    NaN for any column with missing values (e.g. TotalCharges with an empty
    cell for a brand-new customer).
    """
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return _json_safe(obj.tolist())
    if isinstance(obj, np.generic):
        obj = obj.item()
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    return obj


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
        entry, notes = ingest.register_dataframe(
            df,
            filename=filename,
            size=len(contents),
            source=DatasetSource(kind="upload", label="Uploaded file", detail=filename),
        )
    except ingest.IngestError as exc:
        raise ingest.as_http_error(exc) from exc

    return ingest.describe_entry(entry, notes=notes)


def _eligibility_for_report(entry: DatasetEntry, report: Dict[str, Any]) -> Dict[str, Any]:
    """Runs resolve_training_eligibility() against what /validate just found
    and translates it into what the frontend actually needs: which of the
    four states applies, plus only the plain-language details each state's
    UI can use -- never a raw RegistryEntry or internal candidate shape."""
    field_to_col = dict(report["mapping"]["autoMappings"])
    profile = entry.profile
    analysis = report["mapping"]

    state, extra = resolve_training_eligibility(entry, field_to_col, profile, analysis)

    if state == "REUSE_MODEL":
        reg = extra["registryEntry"]
        return {
            "state": state,
            "existingModel": {
                "trainedAt": reg.trained_at,
                "metrics": {
                    "accuracy": reg.metrics.get("accuracy"),
                    "precision": reg.metrics.get("precision"),
                    "recall": reg.metrics.get("recall"),
                    "f1": reg.metrics.get("f1"),
                    "rocAuc": reg.metrics.get("roc_auc"),
                },
                # 'none' | 'moderate' -- 'high' never reaches here, since
                # resolve_training_eligibility() already declined to call
                # this REUSE_MODEL when drift crossed that line (Step 4).
                "driftState": extra.get("driftState", "none"),
            },
        }
    if state == "DERIVE_LABEL":
        candidates = extra["candidates"]
        best = candidates[0]
        return {
            "state": state,
            "suggestion": {
                "rule": best["rule"],
                "column": best["column"],
                "churnValues": best.get("churnValues"),
                "activeValues": best.get("activeValues"),
                # status_column only -- every distinct value the column
                # actually has, so the UI can offer a correctable checklist
                # (churnValues pre-checked) instead of a take-it-or-leave-it
                # suggestion.
                "allValues": best.get("allValues"),
            },
        }
    return {"state": state}


@router.post("/datasets/{dataset_id}/validate")
def validate_dataset(dataset_id: str):
    """Profiles the data, runs automatic column matching, and reports what was
    found. This is the one call the setup flow needs before it can decide
    whether to process automatically or ask the user something."""
    entry = _dataset_or_404(dataset_id)
    report = profiling.build_validation_report(dataset_id, entry.profile)

    # Only worth resolving when the deterministic matcher couldn't place a
    # churn column on its own -- report["issues"] already covers every other
    # blocking case (no rows, all-empty columns, ...), and eligibility only
    # changes what a *missing churn column* means.
    churn_missing = not any(f["key"] == "churn" and f["column"] for f in report["mapping"]["fields"])
    if churn_missing:
        eligibility = _eligibility_for_report(entry, report)
        report["eligibility"] = eligibility
        if eligibility["state"] != "BLOCKED":
            # A missing churn column isn't actually a dead end here (a
            # reusable model or a derivable label exists) -- the frontend
            # should act on `eligibility`, not on a stale "blocked" reading
            # left over from before that was known. Recomputed exactly as
            # profiling.py itself derives `status` from `issues`/`warnings`.
            report["issues"] = [i for i in report["issues"] if i.get("field") != "churn"]
            report["status"] = (
                "blocked" if report["issues"] else "warning" if report["warnings"] else "ready"
            )
    return report


class MapColumnsRequest(BaseModel):
    mappings: Dict[str, str]  # { yourColumnName: churnguardFieldKey }


@router.post("/datasets/{dataset_id}/map-columns")
def map_columns(dataset_id: str, body: MapColumnsRequest):
    entry = _dataset_or_404(dataset_id)

    unknown = [c for c in body.mappings if c not in entry.raw_df.columns]
    if unknown:
        raise HTTPException(400, f"These columns aren't in the connected data: {', '.join(unknown)}.")

    mapped_field_keys = set(body.mappings.values())
    # 'churn' is deliberately exempt from this required-field gate: a
    # dataset with no churn column can still be worth predicting on (see
    # resolve_training_eligibility()'s REUSE_MODEL/DERIVE_LABEL cases,
    # decided at /predict time, not here) -- /map-columns' job is only to
    # confirm every field that *was* given a column is legitimate, not to
    # force churn to exist.
    missing = [f for f in schema.REQUIRED_FIELDS if f["key"] != "churn" and f["key"] not in mapped_field_keys]
    if missing:
        first = missing[0]
        raise HTTPException(
            400,
            f"{first['label']} still needs a column. {first['whyNeeded']} {first['lookFor']}",
        )

    entry.mappings = dict(body.mappings)
    return {"datasetId": dataset_id, "mappings": entry.mappings, "status": "mapped"}


def _mapping_candidates(entry: DatasetEntry, analysis: Dict[str, Any], field_key: str) -> List[Dict[str, Any]]:
    """Every column not confidently (high/medium) claimed by a DIFFERENT
    field is fair game for `field_key` -- including whatever `field_key`
    itself was weakly (low-confidence) assigned, since that is exactly the
    guess an LLM second opinion would be asked to confirm, replace or reject.
    Each candidate carries a few real example values, never the full column."""
    claimed_elsewhere = {
        f["column"] for f in analysis["fields"]
        if f["column"] and f["level"] in ("high", "medium") and f["key"] != field_key
    }
    candidate_names = [c["name"] for c in entry.profile["columns"] if c["name"] not in claimed_elsewhere]

    columns_by_name = {c["name"]: c for c in entry.profile["columns"]}
    candidates = []
    for name in candidate_names:
        seen: List[str] = []
        for row in entry.profile.get("preview", []):
            value = row.get(name, "")
            if value and value not in seen:
                seen.append(value)
        if not seen:
            seen = columns_by_name.get(name, {}).get("distinctValues", [])[:5]
        candidates.append({"name": name, "samples": seen[:5]})
    return candidates


class SuggestMappingRequest(BaseModel):
    field_key: str


@router.post("/datasets/{dataset_id}/suggest-mapping")
def suggest_mapping(dataset_id: str, body: SuggestMappingRequest):
    """LLM-assisted mapping for one field the deterministic matcher
    (mapping.py) couldn't confidently resolve on its own. This is the one
    deliberately LLM-touched step in an otherwise fully heuristic mapping
    pipeline -- see also POST /datasets/{id}/auto-map, which calls this same
    logic for every ambiguous field in one pass so the frontend never has to
    show a manual mapping screen at all."""
    entry = _dataset_or_404(dataset_id)
    field = schema.get_field(body.field_key)
    if field is None:
        raise HTTPException(400, f"Unknown field '{body.field_key}'.")

    analysis = mapping.analyze(entry.profile)
    candidates = _mapping_candidates(entry, analysis, body.field_key)
    if not candidates:
        raise HTTPException(409, "There are no unclaimed columns left to consider for this field.")

    try:
        from ..llm import mapping_generator  # optional extra -- see module docstring
    except ImportError as exc:
        raise HTTPException(
            503,
            "AI-assisted mapping needs the optional LLM packages, which aren't installed on this server. "
            "Install backend/requirements.txt to enable it.",
        ) from exc

    try:
        result = mapping_generator.suggest_column_mapping(field, candidates)
    except (RuntimeError, mapping_generator.MappingSuggestionError) as exc:
        raise HTTPException(503, str(exc)) from exc

    return {
        "fieldKey": body.field_key,
        "column": result["column"],
        "confidence": result["confidence"],
        "reasoning": result["reasoning"],
        "level": "ai-suggested",
        "provider": result["provider"],
    }


@router.post("/datasets/{dataset_id}/auto-map")
def auto_map(dataset_id: str):
    """Fully automatic column resolution: the deterministic matcher
    (mapping.py) first, then one LLM second opinion per required field it
    couldn't confidently resolve on its own -- so the frontend never has to
    show the user a manual mapping screen. Either every required field ends
    up resolved (`resolved: true`, with `mappings` ready to hand straight to
    /map-columns), or it plainly reports which fields it still couldn't
    place and why, for an honest "can't process this" screen instead of a
    form to fill in."""
    entry = _dataset_or_404(dataset_id)
    analysis = mapping.analyze(entry.profile)

    chosen: Dict[str, str] = {f["key"]: f["column"] for f in analysis["fields"] if f["column"]}
    ai_resolved: List[Dict[str, Any]] = []
    unresolved: List[Dict[str, Any]] = []

    llm_available = True
    for field_key in analysis["needsReview"]:
        field = schema.get_field(field_key)
        candidates = _mapping_candidates(entry, analysis, field_key)
        if not candidates:
            unresolved.append({"key": field_key, "label": field["label"], "reason": "No other columns are left to consider."})
            continue
        if not llm_available:
            unresolved.append({
                "key": field_key, "label": field["label"],
                "reason": "AI-assisted mapping isn't available on this server.",
            })
            continue

        try:
            from ..llm import mapping_generator  # optional extra -- see module docstring
        except ImportError:
            llm_available = False
            unresolved.append({
                "key": field_key, "label": field["label"],
                "reason": "AI-assisted mapping needs optional packages that aren't installed on this server.",
            })
            continue

        try:
            result = mapping_generator.suggest_column_mapping(field, candidates)
        except (RuntimeError, mapping_generator.MappingSuggestionError) as exc:
            unresolved.append({"key": field_key, "label": field["label"], "reason": str(exc)})
            continue

        if result["column"] and result["confidence"] >= mapping.MIN_CONFIDENCE:
            chosen[field_key] = result["column"]
            ai_resolved.append({
                "key": field_key,
                "label": field["label"],
                "column": result["column"],
                "confidence": result["confidence"],
                "reasoning": result["reasoning"],
            })
        else:
            unresolved.append({
                "key": field_key,
                "label": field["label"],
                "reason": result["reasoning"] or "Neither the automatic matcher nor AI could confidently place this field.",
            })

    missing_required = [f for f in schema.REQUIRED_FIELDS if f["key"] not in chosen]

    return {
        "datasetId": dataset_id,
        "resolved": not missing_required,
        # Wire format /map-columns expects: {yourColumnName: churnguardFieldKey}.
        "mappings": {col: key for key, col in chosen.items()},
        "aiResolved": ai_resolved,
        "unresolved": unresolved,
        "missingRequired": [
            {"key": f["key"], "label": f["label"], "whyNeeded": f["whyNeeded"], "lookFor": f["lookFor"]}
            for f in missing_required
        ],
    }


class DeriveChurnRequest(BaseModel):
    rule: str = "last_activity"  # 'status_column' | 'cancellation_date' | 'last_activity'
    column: str
    inactivity_days: int = 90           # last_activity only
    churn_values: Optional[List[str]] = None  # status_column only


@router.post("/datasets/{dataset_id}/derive-churn")
def derive_churn(dataset_id: str, body: DeriveChurnRequest):
    """For data with no explicit churn/cancellation column ChurnGuard's
    matcher recognises -- common on streaming/app-style exports, or a CRM
    feed that only tracks account status -- derives one instead, using
    whichever of derive_label.py's three rules the frontend offered and the
    user picked (see IssueList.jsx's derive-and-confirm screen):

      - status_column:     a status column's values are split into
                            churned/active by `churn_values`.
      - cancellation_date:  a value in `column` means cancelled.
      - last_activity:      inactive `inactivity_days`+ as of the most
                            recent date in the file (default, and the only
                            rule that existed before this endpoint was
                            generalised -- kept as the default `rule` so
                            nothing already calling this breaks).

    This is always an explicit, user-confirmed proxy -- never applied
    automatically. Returns the same shape as POST /auto-map so the frontend
    can hand the result straight to the same completion path."""
    entry = _dataset_or_404(dataset_id)
    if body.column not in entry.raw_df.columns:
        raise HTTPException(400, f"\"{body.column}\" isn't a column in this dataset.")
    if body.rule == "last_activity" and body.inactivity_days < 1:
        raise HTTPException(400, "The inactivity threshold must be at least 1 day.")
    if body.rule == "status_column" and not body.churn_values:
        raise HTTPException(400, "Choose at least one value that means \"churned\".")

    try:
        result = derive_label.derive(
            entry.raw_df,
            rule=body.rule,
            column=body.column,
            inactivity_days=body.inactivity_days,
            churn_values=body.churn_values,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    derived = result["series"]

    # Reused (overwritten) on a repeat call for this dataset, rather than
    # naming a fresh column each time -- otherwise retrying with a different
    # rule/threshold would leave the previous attempt sitting in the data as
    # a near-perfect, undetectable-by-name duplicate of the new label.
    if entry.derived_churn_column and entry.derived_churn_column in entry.raw_df.columns:
        derived_column = entry.derived_churn_column
    else:
        derived_column = "Derived_Churn"
        suffix = 2
        while derived_column in entry.raw_df.columns:
            derived_column = f"Derived_Churn_{suffix}"
            suffix += 1
        entry.derived_churn_column = derived_column

    entry.raw_df[derived_column] = derived
    entry.profile = profiling.profile_dataframe(entry.raw_df.astype(str).where(entry.raw_df.notna(), ""))
    # The source column deterministically encodes (or heavily informs) the
    # label ChurnGuard just derived from it -- training on it too would be
    # leakage, not a feature.
    entry.derived_churn_source = body.column

    analysis = mapping.analyze(entry.profile)
    chosen: Dict[str, str] = dict(analysis["autoMappings"])
    chosen["churn"] = derived_column
    missing_required = [f for f in schema.REQUIRED_FIELDS if f["key"] not in chosen]

    return {
        "datasetId": dataset_id,
        "resolved": not missing_required,
        "mappings": {col: key for key, col in chosen.items()},
        "aiResolved": [],
        "unresolved": [],
        "missingRequired": [
            {"key": f["key"], "label": f["label"], "whyNeeded": f["whyNeeded"], "lookFor": f["lookFor"]}
            for f in missing_required
        ],
        "derivation": {
            "rule": body.rule,
            "sourceColumn": body.column,
            "derivedColumn": derived_column,
            "inactivityDays": body.inactivity_days if body.rule == "last_activity" else None,
            "referenceDate": result["reference_date"],
            "note": result["note"],
            "churnedCount": int((derived == "Yes").sum()),
            "activeCount": int((derived == "No").sum()),
            "excludedCount": int((derived == "").sum()),
        },
    }


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

    # 3. Rows with no churn outcome can't teach the model anything. Skipped
    # entirely for REUSE_MODEL scoring (see _score_with_reused_model), which
    # has no churn column at all -- there's no label to be missing.
    if "churn" in model_df.columns:
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


def _compute_top_drivers(
    model_df: pd.DataFrame, feature_cols: List[str], fingerprint: Optional[str] = None
) -> List[Dict[str, Any]]:
    try:
        sample = model_df.sample(n=min(TOP_DRIVERS_SAMPLE_CAP, len(model_df)), random_state=42)
        scaled = generic_predictor.preprocess(sample[feature_cols], fingerprint)
        result = explain_high_risk_batch(scaled, threshold=0.0, nsamples=TOP_DRIVERS_NSAMPLES, fingerprint=fingerprint)
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



# A person's name (or other direct-identity field) is essentially unbounded,
# near-unique categorical noise -- it has no legitimate causal relationship
# to churn, and unlike a genuinely predictive high-cardinality column, the
# trainer's own dtype/cardinality heuristics don't reliably catch it (a
# "Surname" column on a 10k-row dataset is often ~25-35% unique -- under the
# 50% ratio generic/preprocessing.py's find_high_cardinality_categoricals()
# uses to auto-drop, but still guaranteed to put previously-unseen surnames
# in front of the trained encoder at real predict time -- a hard, fail-loud
# crash by encode_categoricals_strict()'s deliberate design, not a bug in
# it). Filtered by name here, before training, same layer as the leakage
# check below -- not a change to the trainer/encoding contract itself.
_IDENTITY_TOKENS = {
    "name", "surname", "lastname", "firstname", "fullname", "forename",
    "givenname", "middlename", "maidenname", "nickname",
}


def _select_extra_columns(df: pd.DataFrame, mapped_and_special: set) -> tuple[List[str], List[Dict[str, str]]]:
    """Every uploaded column that isn't a mapped ChurnGuard field, the ID, or
    the churn label is a candidate extra feature. Two things the trainer's
    own dtype/cardinality heuristics can't reliably catch are filtered here,
    before training -- semantic leakage (a "Churn Score" column sitting next
    to the real churn label) and direct-identity columns (a customer's name)
    -- everything else is left for the trainer to accept or drop on its own
    terms."""
    leakage_tokens = mapping.churn_leakage_tokens()
    candidates = [c for c in df.columns if c not in mapped_and_special]

    kept: List[str] = []
    skipped: List[Dict[str, str]] = []
    for col in candidates:
        tokens = set(schema.tokenize_column_name(col))
        if tokens & leakage_tokens:
            skipped.append({
                "column": col,
                "reason": "its name suggests it may duplicate or derive from the churn outcome itself",
            })
        elif tokens & _IDENTITY_TOKENS:
            skipped.append({
                "column": col,
                "reason": "this looks like a person's name, not a predictive feature",
            })
        else:
            kept.append(col)
    return kept, skipped


def _canonical_feature_columns(field_to_col: Dict[str, str]) -> List[str]:
    """Required + present-optional ChurnGuard fields -- never 'churn' or
    'customer_id', and deliberately never the vertical-specific extras
    _select_extra_columns() finds, which is exactly what makes this a stable
    schema_hash key (see schema_hash.py): two exports of the same shape can
    differ in which stray extra columns happen to be present, but the
    canonical field composition is the durable notion of "shape" the
    REUSE_MODEL case is built on."""
    present_optional = [f for f in OPTIONAL_FEATURE_KEYS if f in field_to_col]
    return MODEL_FEATURE_KEYS + present_optional


def resolve_training_eligibility(
    entry: DatasetEntry,
    field_to_col: Dict[str, str],
    profile: Dict[str, Any],
    analysis: Dict[str, Any],
) -> tuple[str, Dict[str, Any]]:
    """The decision churnguard_generalization_fix_prompt.md's Step 3 + Step 5
    describe: does this connect need training at all, and if there's no
    churn column, can that be worked around before falling back to the
    "can't be analysed" screen? Four outcomes, checked in this order --
    never short-circuited to BLOCKED without genuinely trying REUSE_MODEL
    then DERIVE_LABEL first:

      HAS_TARGET    -- churn is mapped. Business as usual (dataset_routes.py
                       still separately skips a *retrain* here via
                       fingerprint.py's exact-content cache -- a different,
                       narrower mechanism this function doesn't decide).
      REUSE_MODEL   -- no churn column, but a model already exists for this
                       data's canonical field *shape* (schema_hash.py), and
                       every feature that model actually needs is present
                       in this connect -- verified column-by-column, not
                       just "the hash matches", since generic_predictor
                       has no graceful fallback for a missing feature.
      DERIVE_LABEL  -- no churn column, no safely-reusable model, but a
                       plausible proxy label exists (derive_label.py).
      BLOCKED       -- none of the above; the honest final fallback.
    """
    if "churn" in field_to_col:
        return "HAS_TARGET", {}

    canonical_fields = _canonical_feature_columns(field_to_col)
    schema_hash = schema_hash_util.compute_schema_hash(canonical_fields)

    df = entry.raw_df.rename(columns={col: key for key, col in field_to_col.items()})
    extra_cols, _ = _select_extra_columns(df, set(canonical_fields) | {"customer_id"})
    available_columns = set(canonical_fields) | set(extra_cols)

    registry_entry = artifact_registry.get_latest(schema_hash)
    if registry_entry is not None:
        missing = [c for c in registry_entry.feature_columns if c not in available_columns]
        if not missing:
            # Step 4: PSI decides whether this candidate is still a safe
            # reuse, not just an FYI shown after the fact -- computed here,
            # before REUSE_MODEL is ever returned, using the reference stats
            # saved alongside the model (drift.py's compute_reference_stats).
            per_feature_psi = (
                drift_util.psi_against_reference(registry_entry.reference_stats, df)
                if registry_entry.reference_stats
                else {}
            )
            drift_state = drift_util.drift_severity(per_feature_psi)
            if drift_state != "high":
                return "REUSE_MODEL", {
                    "schemaHash": schema_hash,
                    "registryEntry": registry_entry,
                    "driftState": drift_state,
                }
            # High drift: per Step 4, this candidate is no longer a safe
            # reuse -- fall through to DERIVE_LABEL/BLOCKED exactly as if no
            # registry entry existed at all, rather than silently scoring
            # with data the model was never trained anything like.

    candidates = derive_label.detect_candidates(profile, analysis)
    if candidates:
        return "DERIVE_LABEL", {"schemaHash": schema_hash, "candidates": candidates}

    return "BLOCKED", {"schemaHash": schema_hash}


def _load_cached_training(current_user, fingerprint: str) -> Optional[dict]:
    """A previous successful training run for this exact data, scoped to the
    signed-in user -- or None if there isn't one, the caller isn't signed in,
    or the artifacts it points at are no longer on disk (never trust a DB row
    over what's actually there to load)."""
    if current_user is None or not generic_artifacts.is_trained(fingerprint):
        return None
    db = SessionLocal()
    try:
        row = (
            db.query(TrainedModel)
            .join(DatasetRow, TrainedModel.dataset_id == DatasetRow.id)
            .filter(DatasetRow.user_id == current_user.id, TrainedModel.fingerprint == fingerprint)
            .order_by(TrainedModel.trained_at.desc())
            .first()
        )
        return dict(row.report) if row else None
    except Exception:  # noqa: BLE001 -- a DB hiccup means "train normally", never a broken /predict
        return None
    finally:
        db.close()


def _persist_training(current_user, entry: DatasetEntry, fingerprint: str, report: dict) -> None:
    """Records this upload + training result for the signed-in user's
    history, and so a future upload of the identical data can skip training
    (see _load_cached_training). Best-effort: a DB write failure here must
    never fail an otherwise-successful /predict call -- but it is now
    logged, not silently discarded, after a real bug (numpy.int64 in
    `report` breaking JSON serialization) went unnoticed for a while because
    the previous bare except-and-continue gave no trace of it anywhere."""
    db = SessionLocal()
    try:
        dataset_row = DatasetRow(
            user_id=current_user.id,
            filename=entry.filename,
            source_kind=entry.source.kind if entry.source else None,
            source_provider=entry.source.provider if entry.source else None,
            row_count=entry.profile.get("rowCount") if entry.profile else None,
            column_count=entry.profile.get("columnCount") if entry.profile else None,
            fingerprint=fingerprint,
            mappings=dict(entry.mappings) if entry.mappings else None,
        )
        db.add(dataset_row)
        db.flush()
        db.add(
            TrainedModel(
                dataset_id=dataset_row.id,
                fingerprint=fingerprint,
                artifact_dir=generic_artifacts.artifact_dir(fingerprint),
                report=_json_safe(report),
            )
        )
        db.commit()
    except Exception:  # noqa: BLE001 -- best-effort persistence, see docstring
        logger.warning("Failed to persist training history for fingerprint %s", fingerprint, exc_info=True)
        db.rollback()
    finally:
        db.close()


def _persist_predictions(
    current_user,
    fingerprint: str,
    customers: List[Dict[str, Any]],
    raw_features_by_id: Dict[str, Dict[str, Any]],
    top_drivers: List[Dict[str, Any]],
    cleaning: List[Dict[str, Any]],
    extra_columns_used: List[str],
    extra_columns_skipped: List[Dict[str, str]],
) -> None:
    """Stores this run's full results against the TrainedModel row for
    `fingerprint`, so a signed-in user's dataset history shows real past
    predictions, AND so a later re-upload of the identical data can skip
    inference and SHAP entirely, not just the Optuna/StackingClassifier
    training step _load_cached_training() already skips (see
    _load_cached_full_result()). Best-effort and logged on failure, same
    pattern as _persist_training()."""
    if current_user is None:
        return
    db = SessionLocal()
    try:
        row = (
            db.query(TrainedModel)
            .join(DatasetRow, TrainedModel.dataset_id == DatasetRow.id)
            .filter(DatasetRow.user_id == current_user.id, TrainedModel.fingerprint == fingerprint)
            .order_by(TrainedModel.trained_at.desc())
            .first()
        )
        if row is None:
            # No TrainedModel row exists for this fingerprint yet -- e.g. a
            # cache hit reusing artifacts trained under a different user, or
            # persistence genuinely never ran. Nothing to attach scores to.
            return
        row.predictions = _json_safe(customers)
        row.full_result_extra = _json_safe({
            "rawFeaturesById": raw_features_by_id,
            "topDrivers": top_drivers,
            "cleaning": cleaning,
            "extraColumnsUsed": extra_columns_used,
            "extraColumnsSkipped": extra_columns_skipped,
        })
        db.commit()
    except Exception:  # noqa: BLE001 -- best-effort persistence, see docstring
        logger.warning("Failed to persist predictions for fingerprint %s", fingerprint, exc_info=True)
        db.rollback()
    finally:
        db.close()


def _load_cached_full_result(current_user, fingerprint: str) -> Optional[Dict[str, Any]]:
    """A previous full /predict result for this exact data -- or None if
    there isn't one, the caller isn't signed in, or an earlier run only got
    as far as _persist_training() (no `predictions`/`full_result_extra` yet,
    e.g. rows from before this feature existed). Returning None here just
    means run_prediction() falls back to the narrower training-only cache
    (or a full retrain) exactly as if this function didn't exist -- never a
    correctness issue, only a speed one."""
    if current_user is None:
        return None
    db = SessionLocal()
    try:
        row = (
            db.query(TrainedModel)
            .join(DatasetRow, TrainedModel.dataset_id == DatasetRow.id)
            .filter(DatasetRow.user_id == current_user.id, TrainedModel.fingerprint == fingerprint)
            .order_by(TrainedModel.trained_at.desc())
            .first()
        )
        if row is None or not row.predictions or not row.full_result_extra:
            return None
        return {
            "report": dict(row.report),
            "customers": row.predictions,
            "extra": dict(row.full_result_extra),
        }
    except Exception:  # noqa: BLE001 -- a DB hiccup means "compute normally", never a broken /predict
        return None
    finally:
        db.close()


def _score_with_reused_model(
    dataset_id: str,
    entry: DatasetEntry,
    df: pd.DataFrame,
    field_to_col: Dict[str, str],
    feature_cols: List[str],
    registry_entry,
    drift_state: str,
    background_tasks: BackgroundTasks,
) -> Dict[str, Any]:
    """REUSE_MODEL scoring (see resolve_training_eligibility()): this connect
    has no churn column, but a model trained on the same canonical field
    shape already exists and covers every feature it needs. Runs inference +
    SHAP only -- no training, no churn-labelled fields (there's no churn
    history to report, so `churned` is None per customer, never guessed),
    and the response says plainly that scores come from a model trained on
    different, earlier data, plus how much this data has drifted from it."""
    all_feature_cols = registry_entry.feature_columns
    missing_cols = [c for c in all_feature_cols if c not in df.columns]
    if missing_cols:
        # resolve_training_eligibility() already checked this at /validate --
        # a genuine mismatch here means the data or mapping changed since.
        raise HTTPException(
            400,
            "This dataset no longer matches the model ChurnGuard was going to reuse. "
            "Re-check your data and try again.",
        )

    model_df = df[["customer_id"] + all_feature_cols].copy()
    model_df["customer_id"] = model_df["customer_id"].astype(str).str.strip()

    scoring_feature_cols = [f for f in feature_cols if f in all_feature_cols]
    model_df, cleaning = _clean_model_frame(model_df, scoring_feature_cols)
    if model_df.empty:
        raise HTTPException(400, "No usable customer rows were left after cleaning. Check the connected data.")

    generic_predictor.load_from(registry_entry)
    generic_explainer.load_from(registry_entry)
    cache_key = registry_entry.cache_key

    try:
        predictions = generic_predictor.predict(model_df[all_feature_cols], cache_key)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    # `drift_state` was already computed by resolve_training_eligibility()
    # before this function was ever called (Step 4: PSI decides eligibility,
    # not just an after-the-fact FYI) -- reused here rather than recomputed,
    # so /validate's preview and this response can never disagree.

    customers: List[Dict[str, Any]] = []
    customers_by_id: Dict[str, Dict[str, Any]] = {}
    raw_features_by_id: Dict[str, Dict[str, Any]] = {}

    for idx in model_df.index:
        cid = model_df.at[idx, "customer_id"]
        proba_pct = round(float(predictions.at[idx, "churn_probability"]) * 100, 1)
        tier = _risk_tier(proba_pct)
        monthly = _safe_num(model_df.at[idx, "monthly_charges"]) if "monthly_charges" in all_feature_cols else None

        record = {
            "id": cid,
            "tenure": _safe_num(model_df.at[idx, "tenure"]) if "tenure" in all_feature_cols else None,
            "monthlyCharges": monthly,
            "totalCharges": (
                _safe_num(model_df.at[idx, "total_charges"]) if "total_charges" in all_feature_cols else None
            ),
            "contractType": (
                _to_native(model_df.at[idx, "contract_type"]) if "contract_type" in all_feature_cols else None
            ),
            "serviceTier": (
                _to_native(model_df.at[idx, "service_tier"]) if "service_tier" in all_feature_cols else None
            ),
            "paymentMethod": (
                _to_native(model_df.at[idx, "payment_method"]) if "payment_method" in all_feature_cols else None
            ),
            "churnProbability": proba_pct,
            "riskTier": tier,
            "status": "at-risk" if tier in ("high", "critical") else "active",
            "revenueAtRisk": round(monthly * 12 * (proba_pct / 100), 2) if monthly is not None else None,
            # No churn history exists for this connect -- never fabricate one.
            "churned": None,
        }
        customers.append(record)
        customers_by_id[cid] = record
        raw_features_by_id[cid] = {k: model_df.at[idx, k] for k in all_feature_cols}

    entry.customers = customers
    entry.customers_by_id = customers_by_id
    entry.raw_features_by_id = raw_features_by_id
    entry.training_report = registry_entry.load_metadata()
    entry.trained = True
    entry.cleaning = cleaning
    entry.raw_drivers = {}
    entry.explanation_base_value = {}
    entry.ai_explanations = {}
    entry.outreach_drafts = []
    entry.fingerprint = cache_key
    entry.top_drivers = _compute_top_drivers(model_df, all_feature_cols, cache_key)

    eligible_count = sum(1 for c in customers if c["riskTier"] in ("high", "critical"))
    entry.auto_outreach_state = "running" if eligible_count else "done"
    entry.auto_outreach_done = 0
    entry.auto_outreach_total = min(eligible_count, business_rules.MAX_AUTO_DRAFTS_PER_RUN)
    entry.auto_outreach_queued = 0
    entry.auto_outreach_skipped = 0
    if eligible_count:
        background_tasks.add_task(_run_auto_outreach, entry)

    return {
        "datasetId": dataset_id,
        "status": "completed",
        "trainingSource": "reused",
        "customersProcessed": len(customers),
        "fieldsMapped": len(field_to_col),
        "mappedFields": sorted(field_to_col),
        "labelledChurnCount": None,
        "cleaning": cleaning,
        "extraColumnsUsed": [c for c in all_feature_cols if c not in MODEL_FEATURE_KEYS + OPTIONAL_FEATURE_KEYS],
        "extraColumnsSkipped": [],
        "source": entry.source.as_dict(),
        "trainingMetrics": {
            "accuracy": registry_entry.metrics.get("accuracy"),
            "precision": registry_entry.metrics.get("precision"),
            "recall": registry_entry.metrics.get("recall"),
            "f1": registry_entry.metrics.get("f1"),
            "rocAuc": registry_entry.metrics.get("roc_auc"),
        },
        "reusedModel": {
            "trainedAt": registry_entry.trained_at,
            "driftState": drift_state,
        },
        "autoOutreach": entry.auto_outreach_status(),
    }


@router.post("/datasets/{dataset_id}/predict")
def run_prediction(
    dataset_id: str,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_user_optional),
):
    entry = _dataset_or_404(dataset_id)
    if not entry.mappings:
        raise HTTPException(400, "Map your columns before running predictions.")

    field_to_col = {field_key: col for col, field_key in entry.mappings.items() if field_key}
    if "customer_id" not in field_to_col:
        raise HTTPException(400, f"{schema.pretty_feature_name('customer_id')} must be mapped before predicting.")

    df = entry.raw_df.rename(columns={col: field_key for field_key, col in field_to_col.items()})

    present_optional = [f for f in OPTIONAL_FEATURE_KEYS if f in field_to_col]
    feature_cols = MODEL_FEATURE_KEYS + present_optional
    missing_features = [f for f in feature_cols if f not in df.columns]
    if missing_features:
        labels = ", ".join(schema.pretty_feature_name(f) for f in missing_features)
        raise HTTPException(400, f"These mapped columns are missing from the connected data: {labels}.")

    if "churn" not in field_to_col:
        # No churn column -- resolve_training_eligibility() decides whether
        # that's genuinely a dead end (see /validate's `eligibility` field,
        # which the frontend should already have acted on before ever
        # reaching this call; resolved fresh here too, since data or
        # mappings may have changed in between).
        state, extra = resolve_training_eligibility(entry, field_to_col, entry.profile, mapping.analyze(entry.profile))
        if state == "REUSE_MODEL":
            return _score_with_reused_model(
                dataset_id,
                entry,
                df,
                field_to_col,
                feature_cols,
                extra["registryEntry"],
                extra.get("driftState", "none"),
                background_tasks,
            )
        if state == "DERIVE_LABEL":
            raise HTTPException(
                409,
                "This dataset has no churn column yet. Derive one first via "
                f"POST /datasets/{dataset_id}/derive-churn, then map it and try again.",
            )
        raise HTTPException(
            400,
            "ChurnGuard couldn't find or derive a churn outcome for this data, and no existing model fits "
            "its shape. Map a churn column, or connect a dataset that has one.",
        )

    excluded = set(feature_cols) | {"customer_id", "churn"}
    if entry.derived_churn_source and entry.derived_churn_source in df.columns:
        excluded.add(entry.derived_churn_source)
    extra_cols, extra_columns_skipped = _select_extra_columns(df, excluded)
    all_feature_cols = feature_cols + extra_cols

    model_df = df[["customer_id", "churn"] + all_feature_cols].copy()
    model_df["customer_id"] = model_df["customer_id"].astype(str).str.strip()

    model_df, cleaning = _clean_model_frame(model_df, feature_cols)
    if model_df.empty:
        raise HTTPException(400, "No usable customer rows were left after cleaning. Check the connected data.")

    _check_churn_column(model_df, field_to_col["churn"])

    train_df = model_df.drop(columns=["customer_id"])
    fingerprint = fingerprint_util.compute_fingerprint(train_df)
    entry.fingerprint = fingerprint

    logger.warning(
        "CACHE-DEBUG /predict: fingerprint=%s signed_in=%s user_email=%s DB_AVAILABLE=%s",
        fingerprint,
        current_user is not None,
        current_user.email if current_user else None,
        DB_AVAILABLE,
    )

    # Full-result cache: this exact data was already trained, scored AND
    # explained for this account (see _persist_predictions()). Skips not
    # just the Optuna/StackingClassifier retrain (_load_cached_training()
    # already handled that), but also the inference pass and the SHAP
    # top-drivers computation -- the two remaining costs that used to make
    # even a "cached" re-upload take several seconds. Correctness is
    # unaffected: a later per-customer explain click still works, since
    # generic_predictor/generic_explainer lazily reload their artifacts by
    # fingerprint from disk on demand (see predictor.py's _ensure_loaded()),
    # independent of whether predict() ran during this request.
    cached_full = _load_cached_full_result(current_user, fingerprint) if DB_AVAILABLE else None
    logger.warning("CACHE-DEBUG /predict: full_result_cache_hit=%s", cached_full is not None)
    if cached_full is not None:
        report = cached_full["report"]
        customers = cached_full["customers"]
        extra = cached_full["extra"]

        entry.customers = customers
        entry.customers_by_id = {c["id"]: c for c in customers}
        entry.raw_features_by_id = extra["rawFeaturesById"]
        entry.training_report = report
        entry.trained = True
        entry.cleaning = extra["cleaning"]
        entry.raw_drivers = {}
        entry.explanation_base_value = {}
        entry.ai_explanations = {}
        entry.outreach_drafts = []
        entry.top_drivers = extra["topDrivers"]

        # Deliberately NOT re-queuing _run_auto_outreach here, unlike the
        # full-training path below. That loop recomputes a fresh SHAP
        # explanation from scratch for every high/critical-risk customer
        # (entry.raw_drivers is reset above, never carried over) before even
        # attempting to draft a message -- by far the most expensive
        # remaining step, and one a full cache hit has no way to skip
        # per-customer the way it skips training/inference/top-drivers in
        # bulk. Since this exact data was already fully processed before,
        # redoing that work here would only reproduce drafts equivalent to
        # ones already generated on the original run -- cost with no benefit.
        eligible_count = sum(1 for c in customers if c["riskTier"] in ("high", "critical"))
        entry.auto_outreach_state = "done"
        entry.auto_outreach_done = 0
        entry.auto_outreach_total = 0
        entry.auto_outreach_queued = 0
        entry.auto_outreach_skipped = eligible_count

        return {
            "datasetId": dataset_id,
            "status": "completed",
            "customersProcessed": len(customers),
            "fieldsMapped": len(field_to_col),
            "mappedFields": sorted(field_to_col),
            "labelledChurnCount": sum(1 for c in customers if c["churned"]),
            "cleaning": extra["cleaning"],
            "extraColumnsUsed": extra["extraColumnsUsed"],
            "extraColumnsSkipped": extra["extraColumnsSkipped"],
            "source": entry.source.as_dict(),
            "trainingMetrics": {
                "accuracy": report["test_metrics"]["accuracy"],
                "precision": report["test_metrics"]["precision"],
                "recall": report["test_metrics"]["recall"],
                "f1": report["test_metrics"]["f1"],
                "rocAuc": report["test_metrics"]["roc_auc"],
            },
            "autoOutreach": entry.auto_outreach_status(),
            "trainingSource": "cached",
        }

    cached_report = _load_cached_training(current_user, fingerprint) if DB_AVAILABLE else None
    logger.warning("CACHE-DEBUG /predict: training_only_cache_hit=%s", cached_report is not None)
    if cached_report is not None:
        report = cached_report
    else:
        try:
            report = generic_trainer.train_generic_model(
                train_df, target_col="churn", n_trials=PREDICT_N_TRIALS, fingerprint=fingerprint
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        if DB_AVAILABLE and current_user is not None:
            _persist_training(current_user, entry, fingerprint, report)

        # Also register this training under its canonical *schema* shape
        # (schema_hash.py), not just its exact data-content fingerprint --
        # this is what lets a LATER, different connect with no churn column
        # reuse it (resolve_training_eligibility()'s REUSE_MODEL case). Not
        # user-scoped (unlike the content-fingerprint cache above): the
        # whole point is reuse across different connects/exports, so this
        # registry is intentionally a shared, global lookup by shape. Loaded
        # back from the fingerprint-scoped artifacts just saved rather than
        # threading the fitted objects out of train_generic_model(), which
        # stays untouched.
        try:
            canonical_fields = _canonical_feature_columns(field_to_col)
            registry_schema_hash = schema_hash_util.compute_schema_hash(canonical_fields)
            reference_stats = drift_util.compute_reference_stats(train_df, report.get("feature_columns", []))
            artifact_registry.save(
                registry_schema_hash,
                generic_artifacts.load_model(fingerprint),
                generic_artifacts.load_scaler(fingerprint),
                generic_artifacts.load_encoders(fingerprint),
                generic_artifacts.load_background_kmeans(fingerprint),
                report,
                reference_stats,
            )
        except Exception:  # noqa: BLE001 -- registry population is best-effort, never blocks a successful /predict
            pass

    # Training (or a cache hit pointing at a different fingerprint's artifacts)
    # may not match what predictor/explainer currently hold in their module
    # globals. Without this, a second dataset in the same server process could
    # be scored by the wrong model -- new metrics get reported while every
    # customer keeps a stale risk score.
    generic_predictor.reset_cache()
    generic_explainer.reset_cache()

    try:
        predictions = generic_predictor.predict(model_df[all_feature_cols], fingerprint)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    positive_label = report["positive_label"]

    # What the trainer actually kept vs. dropped from our extra candidates --
    # same honesty pattern as `cleaning`. The trainer's own id-like/constant/
    # high-cardinality/datetime heuristics (generic/trainer.py) may have
    # dropped some of `extra_cols` too; only report on those, not the fixed
    # ChurnGuard fields, which are never expected to be dropped.
    trained_features = set(report.get("feature_columns", []))
    extra_columns_used = sorted(c for c in extra_cols if c in trained_features)
    dropped_by_trainer = report.get("dropped_columns", {})
    for category, cols in dropped_by_trainer.items():
        if category == "explicit":
            continue
        reason = _DROPPED_COLUMN_REASONS.get(category, category)
        for col in cols:
            if col in extra_cols:
                extra_columns_skipped.append({"column": col, "reason": reason})

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
            "contractType": _to_native(model_df.at[idx, "contract_type"]) if "contract_type" in feature_cols else None,
            "serviceTier": _to_native(model_df.at[idx, "service_tier"]) if "service_tier" in feature_cols else None,
            "paymentMethod": _to_native(model_df.at[idx, "payment_method"]) if "payment_method" in feature_cols else None,
            "churnProbability": proba_pct,
            "riskTier": tier,
            "status": "at-risk" if tier in ("high", "critical") else "active",
            # None, not 0, when monthly charges weren't in this dataset --
            # $0 at risk would read as "this account is worth nothing",
            # which is a claim about the business, not a missing measurement.
            "revenueAtRisk": round(monthly * 12 * (proba_pct / 100), 2) if monthly is not None else None,
            "churned": churned,
        }
        customers.append(record)
        customers_by_id[cid] = record
        raw_features_by_id[cid] = {k: model_df.at[idx, k] for k in all_feature_cols}

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
    entry.top_drivers = _compute_top_drivers(model_df, all_feature_cols, fingerprint)

    if DB_AVAILABLE:
        _persist_predictions(
            current_user, fingerprint, customers, raw_features_by_id,
            entry.top_drivers, cleaning, extra_columns_used, extra_columns_skipped,
        )

    # Eligible customers (see business_rules.MIN_RISK_TIER_FOR_AUTO_OUTREACH)
    # get outreach drafted automatically, in the background, so the queue is
    # already populated by the time anyone opens Outreach -- not triggered by
    # a click. Runs after the response is sent; never blocks /predict itself.
    #
    # Gated on cached_report is None (a genuinely fresh training run), not
    # just "did we reach this code path" -- this bottom-of-function path is
    # also where a training-only cache hit (cached_report is not None, see
    # above) lands, since that cache only skips the Optuna/StackingClassifier
    # fit, not inference/SHAP/outreach. Without this guard, a training-only
    # cache hit would still recompute a full SHAP explanation for every
    # high/critical-risk customer and re-draft outreach for all of them --
    # the same expensive, pointless-for-unchanged-data work the full-result
    # cache path above already skips, just reached by a different route.
    eligible_count = sum(
        1 for c in customers if c["riskTier"] in ("high", "critical")
    )
    if cached_report is None:
        entry.auto_outreach_state = "running" if eligible_count else "done"
        entry.auto_outreach_done = 0
        entry.auto_outreach_total = min(eligible_count, business_rules.MAX_AUTO_DRAFTS_PER_RUN)
        entry.auto_outreach_queued = 0
        entry.auto_outreach_skipped = 0
        if eligible_count:
            background_tasks.add_task(_run_auto_outreach, entry)
    else:
        entry.auto_outreach_state = "done"
        entry.auto_outreach_done = 0
        entry.auto_outreach_total = 0
        entry.auto_outreach_queued = 0
        entry.auto_outreach_skipped = eligible_count

    return {
        "datasetId": dataset_id,
        "status": "completed",
        "customersProcessed": len(customers),
        "fieldsMapped": len(field_to_col),
        "mappedFields": sorted(field_to_col),
        "labelledChurnCount": labelled_churn_count,
        "cleaning": cleaning,
        "extraColumnsUsed": extra_columns_used,
        "extraColumnsSkipped": extra_columns_skipped,
        "source": entry.source.as_dict(),
        "trainingMetrics": {
            "accuracy": report["test_metrics"]["accuracy"],
            "precision": report["test_metrics"]["precision"],
            "recall": report["test_metrics"]["recall"],
            "f1": report["test_metrics"]["f1"],
            "rocAuc": report["test_metrics"]["roc_auc"],
        },
        "autoOutreach": entry.auto_outreach_status(),
        # 'cached': this exact data (see generic/fingerprint.py) was already
        # trained for this account, so the fitted model was reloaded instead
        # of retrained. Only possible when signed in.
        "trainingSource": "cached" if cached_report is not None else "trained",
    }


@router.get("/datasets/history")
def dataset_history(current_user=Depends(get_current_user)):
    """Every dataset this account has trained before, most recent first --
    the persisted counterpart to the frontend's browser-only IndexedDB
    history (src/services/datasetHistory.js), which remembers the file
    itself for a quick reconnect but knows nothing across devices or after
    the browser's storage is cleared. Requires sign-in; a database that
    isn't configured (see main.py's _auth_router) reports plainly rather
    than pretending there's no history."""
    if not DB_AVAILABLE:
        raise HTTPException(503, "Dataset history needs a database, which isn't configured on this server.")

    db = SessionLocal()
    try:
        rows = (
            db.query(DatasetRow)
            .filter(DatasetRow.user_id == current_user.id)
            .order_by(DatasetRow.uploaded_at.desc())
            .limit(50)
            .all()
        )
        out = []
        for row in rows:
            latest_model = (
                db.query(TrainedModel)
                .filter(TrainedModel.dataset_id == row.id)
                .order_by(TrainedModel.trained_at.desc())
                .first()
            )
            out.append({
                "id": row.id,
                "filename": row.filename,
                "sourceKind": row.source_kind,
                "sourceProvider": row.source_provider,
                "rowCount": row.row_count,
                "columnCount": row.column_count,
                "fingerprint": row.fingerprint,
                "uploadedAt": row.uploaded_at.isoformat() if row.uploaded_at else None,
                "trained": latest_model is not None,
                "trainedAt": latest_model.trained_at.isoformat() if latest_model else None,
                "metrics": (
                    {
                        "accuracy": latest_model.report.get("test_metrics", {}).get("accuracy"),
                        "recall": latest_model.report.get("test_metrics", {}).get("recall"),
                        "rocAuc": latest_model.report.get("test_metrics", {}).get("roc_auc"),
                    }
                    if latest_model
                    else None
                ),
                # Whether GET /datasets/history/{id}/predictions has anything
                # to return -- lets the frontend show/hide a "view
                # predictions" action per row without a second round trip.
                "predictionsAvailable": bool(latest_model and latest_model.predictions),
                "customersProcessed": len(latest_model.predictions) if latest_model and latest_model.predictions else None,
            })
        return {"datasets": out}
    finally:
        db.close()


@router.get("/datasets/history/{dataset_row_id}/predictions")
def dataset_history_predictions(dataset_row_id: str, current_user=Depends(get_current_user)):
    """The detail view behind one row of dataset_history(): every
    customer-level score from that dataset's most recent training run.
    Ownership is checked via the Dataset row's user_id -- knowing a row's id
    is never sufficient on its own to read another user's data."""
    if not DB_AVAILABLE:
        raise HTTPException(503, "Dataset history needs a database, which isn't configured on this server.")

    db = SessionLocal()
    try:
        dataset_row = (
            db.query(DatasetRow)
            .filter(DatasetRow.id == dataset_row_id, DatasetRow.user_id == current_user.id)
            .first()
        )
        if dataset_row is None:
            raise HTTPException(404, "That dataset history entry doesn't exist, or isn't yours.")

        latest_model = (
            db.query(TrainedModel)
            .filter(TrainedModel.dataset_id == dataset_row.id)
            .order_by(TrainedModel.trained_at.desc())
            .first()
        )
        if latest_model is None or not latest_model.predictions:
            raise HTTPException(404, "No stored predictions for this dataset yet.")

        return {
            "datasetId": dataset_row.id,
            "filename": dataset_row.filename,
            "trainedAt": latest_model.trained_at.isoformat(),
            "customers": latest_model.predictions,
        }
    finally:
        db.close()


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
            "contractType": "contract_type" in mapped,
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

    labelled = [c for c in customers if c["churned"] is not None]
    retention_rate = (
        round(100 - (sum(1 for c in labelled if c["churned"]) / len(labelled) * 100), 1) if labelled else None
    )

    kpis = {
        "totalCustomers": {"value": total},
        "customersAtRisk": {"value": len(at_risk)},
        "avgChurnRisk": {"value": avg_risk},
    }
    if retention_rate is not None:
        kpis["retentionRate"] = {"value": retention_rate}

    # Only meaningful when monthly charges were mapped -- a dataset with no
    # billing amount (a free/subscription-tier product, say) has no dollar
    # figure to report, and $0 would misleadingly read as "nothing at risk".
    if "monthly_charges" in entry.mapped_field_keys():
        revenue_at_risk = round(sum(c["revenueAtRisk"] or 0 for c in at_risk), 2)
        kpis["revenueAtRisk"] = {"value": revenue_at_risk}

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
    records; empty when monthly charges wasn't part of this dataset (an
    optional field -- not every business bills a flat recurring amount)."""
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
        scaled = generic_predictor.preprocess(raw_df, entry.fingerprint)
        explanation = explain_customer(scaled, fingerprint=entry.fingerprint)
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


def _compute_pretty_drivers(entry: DatasetEntry, customer_id: str) -> List[Dict[str, Any]]:
    """The shape llm/outreach_generator.py (and the explain endpoint) expect:
    real values and SHAP contributions, pretty feature names. Shared by the
    on-demand "Draft outreach" button and the automatic post-training
    pipeline (backend/agents/outreach_workflow.py) so both draft from
    identically-computed, identically-named factors."""
    raw = _ensure_drivers(entry, customer_id)
    return [
        {"feature": schema.pretty_feature_name(d["feature"]), "value": d["value"], "shap_value": d["shap_value"]}
        for d in raw[:5]
    ]


def _run_auto_outreach(entry: DatasetEntry) -> None:
    """The automatic post-training outreach pipeline's entry point, run as a
    FastAPI BackgroundTask (see run_prediction()) so it executes after the
    /predict response has already been sent -- drafting outreach for a
    dataset's worth of at-risk customers can take minutes and must never make
    the user wait on it. Delegates the actual decision-making to
    backend/agents/outreach_workflow.py's LangGraph pipeline, one customer at
    a time. Never raises: a failure here must not corrupt entry state or take
    down the background worker."""
    try:
        from ..agents import outreach_workflow  # optional extra -- pulls in langgraph
    except ImportError:
        entry.auto_outreach_state = "done"
        return

    already_drafted_ids = {d["customerId"] for d in entry.outreach_drafts}
    eligible = [c for c in entry.customers if c["riskTier"] in ("high", "critical")]
    # Worst risk first: if there are more eligible accounts than the cap,
    # the ones that matter most still get drafted.
    eligible.sort(key=lambda c: c["churnProbability"], reverse=True)

    for customer in eligible[: business_rules.MAX_AUTO_DRAFTS_PER_RUN]:
        try:
            result = outreach_workflow.run_for_customer(
                customer,
                compute_drivers=lambda cid: _compute_pretty_drivers(entry, cid),
                already_drafted_ids=already_drafted_ids,
            )
        except Exception:  # noqa: BLE001 -- one customer's failure must not stop the run
            result = {"status": "failed"}

        entry.auto_outreach_done += 1

        if result.get("status") == "queued":
            now = datetime.now(timezone.utc).isoformat()
            drivers_used = _compute_pretty_drivers(entry, customer["id"])  # cached, not recomputed
            draft = {
                "id": f"OUT-{int(time.time() * 1000)}-{customer['id']}",
                "customerId": customer["id"],
                "customerName": customer["id"],
                "contactName": None,
                "contactEmail": None,
                "subject": result["draft"]["subject"],
                "body": result["draft"]["body"],
                "status": "draft",
                "tone": "professional",
                "auto": True,  # drafted by the pipeline, not a click -- see CompleteStep-style badges
                "createdAt": now,
                "updatedAt": now,
                "basedOn": {
                    "churnProbability": customer["churnProbability"],
                    "drivers": [
                        {"feature": d["feature"], "value": str(d["value"])} for d in drivers_used[:3]
                    ],
                },
                "auditTrail": [{
                    "action": f"AI generated draft automatically after training ({result['draft']['provider']})",
                    "user": "System",
                    "timestamp": now,
                }],
            }
            entry.outreach_drafts.append(draft)
            already_drafted_ids.add(customer["id"])
            entry.auto_outreach_queued += 1
        else:
            entry.auto_outreach_skipped += 1

    entry.auto_outreach_state = "done"


@router.get("/outreach/auto-status")
def get_auto_outreach_status():
    """Lets the Outreach page show real progress ("drafting 12 of 23...")
    instead of a spinner with no information, while the background pipeline
    from /predict is still running."""
    entry = _current_or_404()
    return entry.auto_outreach_status()


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

    pretty_drivers = _compute_pretty_drivers(entry, customer_id)

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
        "subject": result["subject"],
        "body": result["message"],
        "status": "draft",
        "tone": "professional",
        "auto": False,  # requested on demand, not by the automatic post-training pipeline
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