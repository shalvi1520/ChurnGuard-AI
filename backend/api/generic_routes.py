"""
FastAPI routes for the generic cross-vertical churn pipeline. Not wired to
any frontend yet -- request/response shapes and real calls into
backend/generic/{trainer,predictor,explainer}.py so a frontend can be
connected to this later.
"""
from typing import Any, Dict, List, Optional, Union

import pandas as pd
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from ..generic import artifacts as generic_artifacts
from ..generic import config as generic_config
from ..generic import explainer as generic_explainer
from ..generic import predictor as generic_predictor
from ..generic import trainer as generic_trainer
from ..generic.io_utils import load_dataset_from_bytes

router = APIRouter(prefix="/generic", tags=["generic"])


def _parse_drop_cols(value: Optional[str]):
    if not value:
        return None
    return [c.strip() for c in value.split(",") if c.strip()]


def _read_upload(file: UploadFile, contents: bytes) -> pd.DataFrame:
    try:
        return load_dataset_from_bytes(file.filename, contents)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


class PredictResult(BaseModel):
    churn_probability: float
    churn_prediction: int
    threshold_used: float


class ExplainResponse(BaseModel):
    base_value: float
    shap_values: Dict[str, float]
    churn_probability: float


class StatusResponse(BaseModel):
    trained: bool
    trained_at: Optional[str] = None
    feature_columns: Optional[List[str]] = None
    target_col: Optional[str] = None
    positive_label: Optional[Any] = None
    imbalance_strategy: Optional[str] = None
    test_metrics: Optional[Dict[str, Any]] = None


@router.post("/train")
async def train_endpoint(
    file: UploadFile = File(...),
    target_column: str = Form(...),
    target_recall: float = Form(generic_config.DEFAULT_TARGET_RECALL),
    extra_drop_cols: Optional[str] = Form(None),
    positive_label: Optional[str] = Form(None),
    n_trials: int = Form(generic_config.DEFAULT_N_TRIALS),
    imbalance_strategy: str = Form(generic_config.DEFAULT_IMBALANCE_STRATEGY),
):
    contents = await file.read()
    df = _read_upload(file, contents)
    try:
        report = generic_trainer.train_generic_model(
            df,
            target_col=target_column,
            target_recall=target_recall,
            extra_drop_cols=_parse_drop_cols(extra_drop_cols),
            positive_label=positive_label,
            n_trials=n_trials,
            imbalance_strategy=imbalance_strategy,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return report


@router.post("/predict", response_model=List[PredictResult])
def predict_endpoint(payload: Union[Dict[str, Any], List[Dict[str, Any]]]):
    rows = payload if isinstance(payload, list) else [payload]
    raw_df = pd.DataFrame(rows)
    try:
        result = generic_predictor.predict(raw_df)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Generic model not trained yet. Call POST /generic/train first.")

    return [
        PredictResult(
            churn_probability=float(row["churn_probability"]),
            churn_prediction=int(row["churn_prediction"]),
            threshold_used=float(row["threshold_used"]),
        )
        for _, row in result.iterrows()
    ]


@router.post("/explain", response_model=ExplainResponse)
def explain_endpoint(
    payload: Dict[str, Any], nsamples: int = generic_config.SHAP_NSAMPLES_DEFAULT, seed: int = generic_config.SHAP_SEED_DEFAULT
):
    raw_df = pd.DataFrame([payload])
    try:
        scaled = generic_predictor.preprocess(raw_df)
        explanation = generic_explainer.explain_customer(scaled, nsamples=nsamples, seed=seed)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Generic model not trained yet. Call POST /generic/train first.")

    proba = float(generic_predictor.predict(raw_df).iloc[0]["churn_probability"])
    shap_values = dict(zip(explanation.feature_names, explanation.values[0].tolist()))
    return ExplainResponse(
        base_value=float(explanation.base_values[0]),
        shap_values=shap_values,
        churn_probability=proba,
    )


@router.get("/status", response_model=StatusResponse)
def status_endpoint():
    if not generic_artifacts.is_trained():
        return StatusResponse(trained=False)
    metadata = generic_artifacts.load_metadata()
    return StatusResponse(
        trained=True,
        trained_at=metadata.get("trained_at"),
        feature_columns=metadata.get("feature_columns"),
        target_col=metadata.get("target_col"),
        positive_label=metadata.get("positive_label"),
        imbalance_strategy=metadata.get("imbalance_strategy"),
        test_metrics=metadata.get("test_metrics"),
    )
