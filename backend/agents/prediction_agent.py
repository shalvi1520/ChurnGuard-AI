"""
Thin wrapper around the existing prediction logic -- no prediction logic
lives here. Picks the Telco or generic predictor module based on
pipeline_type.
"""
import pandas as pd

from .. import predictor as telco_predictor
from ..generic import predictor as generic_predictor


def _predictor_for(pipeline_type: str):
    if pipeline_type == "telco":
        return telco_predictor
    if pipeline_type == "generic":
        return generic_predictor
    raise ValueError(f"Unknown pipeline_type '{pipeline_type}'; expected 'telco' or 'generic'.")


def run(customer_id: str, raw_features: dict, pipeline_type: str) -> dict:
    predictor_module = _predictor_for(pipeline_type)
    raw_df = pd.DataFrame([raw_features])
    result = predictor_module.predict(raw_df).iloc[0]
    return {
        "customer_id": customer_id,
        "risk_score": float(result["churn_probability"]),
        "churn_prediction": int(result["churn_prediction"]),
        "threshold": float(result["threshold_used"]),
    }
