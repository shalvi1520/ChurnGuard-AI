"""
Rebuilds the KernelExplainer from the generic pipeline's saved artifacts
and exposes explain_customer() + the batch high-risk precompute path.
Structural duplicate of backend/explainer.py (intentionally not
shared/refactored -- the two pipelines stay fully independent), pointed
at generic artifacts.
"""
import numpy as np
import pandas as pd
import shap

from . import artifacts, config

_model = None
_background_kmeans = None
_feature_columns = None
_kernel_explainer = None


def _ensure_loaded() -> None:
    global _model, _background_kmeans, _feature_columns, _kernel_explainer
    if _kernel_explainer is None:
        _model = artifacts.load_model()
        _background_kmeans = artifacts.load_background_kmeans()
        _feature_columns = artifacts.load_metadata()["feature_columns"]

        def _stack_predict_proba_class1(x_arr):
            x_df = pd.DataFrame(x_arr, columns=_feature_columns)
            return _model.predict_proba(x_df)[:, 1]

        _kernel_explainer = shap.KernelExplainer(_stack_predict_proba_class1, _background_kmeans)


def reset_cache() -> None:
    """Drops the cached explainer so it is rebuilt from the current artifacts.
    Must be called whenever a new model is trained -- see the matching note in
    predictor.reset_cache(); a stale KernelExplainer would attribute risk using
    the previous dataset's model."""
    global _model, _background_kmeans, _feature_columns, _kernel_explainer
    _model = _background_kmeans = _feature_columns = _kernel_explainer = None


def explain_customer(
    customer_row: pd.DataFrame, nsamples: int = config.SHAP_NSAMPLES_DEFAULT, seed: int = config.SHAP_SEED_DEFAULT
) -> shap.Explanation:
    """
    customer_row: a single-row DataFrame of already-scaled features
    (e.g. from predictor.preprocess()).

    np.random.seed(seed) is set before shap_values() because
    KernelExplainer is non-deterministic otherwise -- same fix as the
    Telco explainer.
    """
    _ensure_loaded()
    np.random.seed(seed)
    sv = _kernel_explainer.shap_values(customer_row.values, nsamples=nsamples)
    sv = np.array(sv).reshape(1, -1)

    return shap.Explanation(
        values=sv,
        base_values=np.array([_kernel_explainer.expected_value]),
        data=customer_row.values,
        feature_names=customer_row.columns.tolist(),
    )


def explain_high_risk_batch(
    scaled_df: pd.DataFrame,
    threshold: float,
    nsamples: int = config.SHAP_NSAMPLES_DEFAULT,
    seed: int = config.SHAP_SEED_DEFAULT,
) -> pd.DataFrame:
    """Batch precompute path: one SHAP call for all customers at/above the
    tuned decision threshold, not one-by-one."""
    _ensure_loaded()
    proba = pd.Series(
        _model.predict_proba(scaled_df[_feature_columns])[:, 1], index=scaled_df.index
    )
    high_risk_mask = proba >= threshold
    x_high_risk = scaled_df.loc[high_risk_mask, _feature_columns]

    np.random.seed(seed)
    shap_values_batch = _kernel_explainer.shap_values(x_high_risk.values, nsamples=nsamples)

    results = pd.DataFrame(
        np.array(shap_values_batch), columns=_feature_columns, index=x_high_risk.index
    )
    results["churn_probability"] = proba[high_risk_mask]
    results["base_value"] = _kernel_explainer.expected_value
    return results
