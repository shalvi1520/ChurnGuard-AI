"""
Thin wrapper around the existing SHAP explainer logic -- no SHAP logic
lives here. Produces a human-readable top-driver breakdown by pairing each
SHAP value with its original (pre-encoding, pre-scaling) feature value,
reusing the same feature-engineering/preprocessing primitives the
predictor modules already use, purely for display purposes.
"""
from typing import Any, List

import pandas as pd

from .. import explainer as telco_explainer
from .. import predictor as telco_predictor
from ..feature_engineering import engineer_features as telco_engineer_features
from ..generic import artifacts as generic_artifacts
from ..generic import explainer as generic_explainer
from ..generic import predictor as generic_predictor
from ..generic import preprocessing as generic_preprocessing

TOP_N_DRIVERS = 5


def _to_native(value: Any) -> Any:
    return value.item() if hasattr(value, "item") else value


def _human_readable_values_telco(raw_df: pd.DataFrame, feature_columns: List[str]) -> dict:
    engineered = telco_engineer_features(raw_df)
    row = engineered.iloc[0]
    return {col: _to_native(row[col]) for col in feature_columns if col in engineered.columns}


def _human_readable_values_generic(raw_df: pd.DataFrame, metadata: dict) -> dict:
    feature_columns = metadata["feature_columns"]
    data = generic_preprocessing.select_and_order_features(raw_df, feature_columns)
    data = generic_preprocessing.impute_numeric(data, metadata["numeric_medians"])
    data = generic_preprocessing.impute_categorical(
        data, metadata["categorical_cols"], metadata["categorical_placeholder"]
    )
    row = data.iloc[0]
    return {col: _to_native(row[col]) for col in feature_columns}


def run(raw_features: dict, pipeline_type: str, nsamples: int = 50) -> List[dict]:
    raw_df = pd.DataFrame([raw_features])

    if pipeline_type == "telco":
        scaled = telco_predictor.preprocess(raw_df)
        explanation = telco_explainer.explain_customer(scaled, nsamples=nsamples)
        human_values = _human_readable_values_telco(raw_df, explanation.feature_names)
    elif pipeline_type == "generic":
        metadata = generic_artifacts.load_metadata()
        scaled = generic_predictor.preprocess(raw_df)
        explanation = generic_explainer.explain_customer(scaled, nsamples=nsamples)
        human_values = _human_readable_values_generic(raw_df, metadata)
    else:
        raise ValueError(f"Unknown pipeline_type '{pipeline_type}'; expected 'telco' or 'generic'.")

    drivers = [
        {"feature": name, "value": human_values.get(name), "shap_value": float(shap_value)}
        for name, shap_value in zip(explanation.feature_names, explanation.values[0])
    ]
    drivers.sort(key=lambda d: abs(d["shap_value"]), reverse=True)
    return drivers[:TOP_N_DRIVERS]
