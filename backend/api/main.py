"""
FastAPI route stubs for /predict and /explain/{customer_id}.

These define request/response shapes and call into predictor.py /
explainer.py, but are NOT wired to any frontend, database, or
background-job system yet -- that comes later per the project scope.
"""
import os

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .. import predictor
from .dataset_routes import router as dataset_router
from .generic_routes import router as generic_router
from .orchestration_routes import router as orchestration_router

app = FastAPI(title="ChurnGuard Backend")

# Explicit origins (comma-separated) still work via CORS_ORIGINS for anyone
# who wants to lock this down. Left unset, we match any localhost/127.0.0.1
# port -- Vite auto-increments its port (5173, 5174, 5175, ...) whenever the
# previous one is still occupied by another dev-server instance, and a fixed
# allow-list silently breaks the very next time that happens.
_cors_origins_env = os.getenv("CORS_ORIGINS")
_cors_kwargs = (
    {"allow_origins": [o.strip() for o in _cors_origins_env.split(",") if o.strip()]}
    if _cors_origins_env
    else {"allow_origin_regex": r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"}
)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    **_cors_kwargs,
)

app.include_router(dataset_router)
app.include_router(generic_router)
app.include_router(orchestration_router)


class CustomerFeatures(BaseModel):
    """Raw customer attributes, matching the IBM Telco schema the model was trained on."""

    gender: str = Field(..., alias="Gender")
    senior_citizen: str = Field(..., alias="Senior Citizen")
    partner: str = Field(..., alias="Partner")
    dependents: str = Field(..., alias="Dependents")
    tenure_months: int = Field(..., alias="Tenure Months")
    phone_service: str = Field(..., alias="Phone Service")
    multiple_lines: str = Field(..., alias="Multiple Lines")
    internet_service: str = Field(..., alias="Internet Service")
    online_security: str = Field(..., alias="Online Security")
    online_backup: str = Field(..., alias="Online Backup")
    device_protection: str = Field(..., alias="Device Protection")
    tech_support: str = Field(..., alias="Tech Support")
    streaming_tv: str = Field(..., alias="Streaming TV")
    streaming_movies: str = Field(..., alias="Streaming Movies")
    contract: str = Field(..., alias="Contract")
    paperless_billing: str = Field(..., alias="Paperless Billing")
    payment_method: str = Field(..., alias="Payment Method")
    monthly_charges: float = Field(..., alias="Monthly Charges")
    total_charges: float = Field(..., alias="Total Charges")

    model_config = {"populate_by_name": True}


class PredictRequest(BaseModel):
    customer_id: str
    features: CustomerFeatures


class PredictResponse(BaseModel):
    customer_id: str
    churn_probability: float
    churn_prediction: int
    threshold_used: float


class ExplainResponse(BaseModel):
    customer_id: str
    base_value: float
    shap_values: dict
    churn_probability: float


@app.post("/predict", response_model=PredictResponse)
def predict_endpoint(request: PredictRequest) -> PredictResponse:
    """Stub: shape only. Loads real artifacts via predictor.predict()."""
    raw_df = pd.DataFrame([request.features.model_dump(by_alias=True)])
    try:
        result = predictor.predict(raw_df)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Model artifacts not found. Run train_and_export.py first.")

    row = result.iloc[0]
    return PredictResponse(
        customer_id=request.customer_id,
        churn_probability=float(row["churn_probability"]),
        churn_prediction=int(row["churn_prediction"]),
        threshold_used=float(row["threshold_used"]),
    )


@app.get("/explain/{customer_id}", response_model=ExplainResponse)
def explain_endpoint(customer_id: str) -> ExplainResponse:
    """
    Stub only: looking a customer up by ID requires a database/customer
    store, which is explicitly out of scope for this step. Returns 501
    rather than fabricating a response.
    """
    raise HTTPException(
        status_code=501,
        detail="Not implemented: customer lookup requires a data store, to be wired in a later step.",
    )
