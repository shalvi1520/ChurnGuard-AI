"""
FastAPI route stubs for /predict and /explain/{customer_id}.

These define request/response shapes and call into predictor.py /
explainer.py, but are NOT wired to any frontend, database, or
background-job system yet -- that comes later per the project scope.
"""
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .. import predictor
from .generic_routes import router as generic_router
from .orchestration_routes import router as orchestration_router

app = FastAPI(title="ChurnGuard Backend (stub)")
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
