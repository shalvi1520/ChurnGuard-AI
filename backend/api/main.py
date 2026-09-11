"""
The ChurnGuard FastAPI application.

`dataset_routes` and `connector_routes` are the API the frontend actually
uses. `generic_routes` (the raw train/predict/explain pipeline) and
`orchestration_routes` (the LangGraph agent pipeline) are extra surfaces for
scripting; they are mounted when their dependencies are present.

Optional routers are imported defensively on purpose: the LangGraph and Telco
routes pull in packages the churn pipeline itself doesn't need, and a missing
optional install must never stop a user from connecting a dataset. Anything
that fails to mount is reported at /api/health rather than silently ignored.
"""
import logging
import os

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .connector_routes import router as connector_router
from .dataset_routes import router as dataset_router

logger = logging.getLogger(__name__)

app = FastAPI(
    title="ChurnGuard Backend",
    description="Churn prediction, SHAP explanation and retention drafting for a connected customer dataset.",
)

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
app.include_router(connector_router)

# --- optional routers -------------------------------------------------------

OPTIONAL_ROUTERS_SKIPPED = {}


def _mount_optional(name: str, loader) -> None:
    try:
        app.include_router(loader())
    except (ImportError, RuntimeError) as exc:
        # ImportError: an optional package isn't installed. RuntimeError: the
        # auth router's database.py/security.py raise this when configured
        # but missing required env vars (DATABASE_URL, JWT_SECRET) -- both are
        # "this optional feature isn't available", never a reason to stop the
        # core churn pipeline from starting.
        OPTIONAL_ROUTERS_SKIPPED[name] = str(exc)
        logger.warning("Optional router %r not mounted: %s", name, exc)


def _generic_router():
    from .generic_routes import router
    return router


def _orchestration_router():
    from .orchestration_routes import router
    return router


def _seed_demo_account() -> None:
    """The landing page's "Explore Demo" link and LoginPage's prefilled form
    (src/pages/auth/LoginPage.jsx) both assume demo@churnguard.ai / demo2026
    just works -- true under the old mock authService, which accepted any
    password. With real accounts that login would 401 unless this account
    genuinely exists, so it's seeded once here rather than special-casing
    "any password works for this one email" (a real backdoor, not a fix)."""
    from ..db import security
    from ..db.database import SessionLocal
    from ..db.models import User

    db = SessionLocal()
    try:
        if not db.query(User).filter(User.email == "demo@churnguard.ai").first():
            db.add(User(
                email="demo@churnguard.ai",
                password_hash=security.hash_password("demo2026"),
                name="Demo User",
                company="ChurnGuard Demo",
            ))
            db.commit()
    finally:
        db.close()


def _auth_router():
    # Requires DATABASE_URL + JWT_SECRET (backend/.env) and the sqlalchemy/
    # psycopg2/bcrypt/pyjwt extras -- optional so a server with no database
    # configured still serves the core churn pipeline, just without accounts,
    # persisted dataset history, or retrain-skipping.
    from .auth_routes import router

    from ..db.database import Base, engine
    from ..db import models  # noqa: F401 -- import registers the tables on Base

    Base.metadata.create_all(bind=engine)
    _seed_demo_account()
    return router


_mount_optional("generic", _generic_router)
_mount_optional("orchestration", _orchestration_router)
_mount_optional("auth", _auth_router)


@app.get("/")
def root():
    return {
        "service": "ChurnGuard Backend",
        "docs": "/docs",
        "health": "/api/health",
        "optionalRoutersSkipped": OPTIONAL_ROUTERS_SKIPPED,
    }


# --- Telco pipeline endpoints (pre-existing, not used by the frontend) -------
#
# These serve the fixed-schema Telco model in backend/ (as opposed to the
# generic pipeline the app runs on). Left in place and unchanged in behaviour;
# they need Telco artifacts produced by backend/train_and_export.py.

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
    from .. import predictor

    raw_df = pd.DataFrame([request.features.model_dump(by_alias=True)])
    try:
        result = predictor.predict(raw_df)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503, detail="Model artifacts not found. Run train_and_export.py first."
        ) from exc

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
    store, which is out of scope for this endpoint. Returns 501 rather than
    fabricating a response. (The app's real per-customer explanation is
    GET /api/customers/{id}/explanation.)
    """
    raise HTTPException(
        status_code=501,
        detail="Not implemented: use GET /api/customers/{customer_id}/explanation for the connected dataset.",
    )
