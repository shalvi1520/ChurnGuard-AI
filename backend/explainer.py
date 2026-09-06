"""
Rebuilds the KernelExplainer from saved pieces (model, background_kmeans)
and exposes explain_customer() + the batch high-risk precompute path.
Mirrors final_ml_shap.ipynb Cells 8-9 and 13-14. The wrapped predict_proba
is the full StackingClassifier's, not a single base learner -- same as
the notebook.
"""
import numpy as np
import pandas as pd
import shap

from . import artifacts

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


def explain_customer(customer_row: pd.DataFrame, nsamples: int = 50, seed: int = 42) -> shap.Explanation:
    """
    customer_row: a single-row DataFrame of already-scaled features
    (e.g. from predictor.preprocess()), matching notebook Cell 9.

    np.random.seed(seed) is set before shap_values() because
    KernelExplainer is non-deterministic otherwise -- confirmed to cause
    the same customer to get different SHAP values on repeated calls.
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
    scaled_df: pd.DataFrame, threshold: float, nsamples: int = 50, seed: int = 42
) -> pd.DataFrame:
    """
    Batch precompute path from notebook Cells 13-14: one SHAP call for
    all customers at/above the tuned decision threshold, not one-by-one.
    scaled_df must already be scaled/encoded (e.g. from predictor.preprocess()).
    """
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
