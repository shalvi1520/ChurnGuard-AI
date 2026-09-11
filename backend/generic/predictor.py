"""
Loads the generic pipeline's trained model/scaler/encoders and exposes
predict(). Mirrors backend/predictor.py's preprocess()/predict() contract,
with one addition: a feature column entirely absent from the request is
the existing "missing expected column" ValueError (schema mismatch), while
a column present but null for one row is imputed via the saved
medians/placeholder, not rejected -- a distinction the fixed-schema Telco
path never needed since its requests are always fully populated.
"""
import pandas as pd

from . import artifacts
from . import preprocessing as prep

_model = None
_scaler = None
_encoders = None
_metadata = None
_loaded_fingerprint = "__unset__"  # distinct from None, which is a legitimate fingerprint value


def _ensure_loaded(fingerprint: str = None) -> None:
    global _model, _scaler, _encoders, _metadata, _loaded_fingerprint
    if _model is None or _loaded_fingerprint != fingerprint:
        _model = artifacts.load_model(fingerprint)
        _scaler = artifacts.load_scaler(fingerprint)
        _encoders = artifacts.load_encoders(fingerprint)
        _metadata = artifacts.load_metadata(fingerprint)
        _loaded_fingerprint = fingerprint


def load_from(entry) -> None:
    """Populates the cache directly from an already-resolved
    artifact_registry.RegistryEntry instead of the fingerprint-keyed file
    lookup -- used for REUSE_MODEL scoring (dataset_routes.py's
    resolve_training_eligibility()), where the model being served was
    trained on a *different*, earlier connect's data, not this one.

    Sets the cache's fingerprint to a value that can never collide with a
    real content fingerprint (fingerprint.py's are hex sha256 digests, this
    is prefixed and not one), so a later fingerprint-keyed predict()/
    preprocess() call correctly detects the mismatch and reloads instead of
    silently reusing a REUSE_MODEL registry entry it wasn't asked for."""
    global _model, _scaler, _encoders, _metadata, _loaded_fingerprint
    _model = entry.load_model()
    _scaler = entry.load_scaler()
    _encoders = entry.load_encoders()
    _metadata = entry.load_metadata()
    _loaded_fingerprint = entry.cache_key


def reset_cache() -> None:
    """Drops the in-process model cache so the next predict() re-reads the
    artifacts from disk.

    Still needed even with fingerprint-aware loading below: two different
    datasets can share a fingerprint's *absence* (both None, the flat-path/
    no-fingerprint case), or a caller may reuse the same fingerprint value
    while the underlying artifacts on disk changed. Call this whenever you
    can't be sure the cached fingerprint still matches what's on disk.
    """
    global _model, _scaler, _encoders, _metadata, _loaded_fingerprint
    _model = _scaler = _encoders = _metadata = None
    _loaded_fingerprint = "__unset__"


def preprocess(raw_df: pd.DataFrame, fingerprint: str = None) -> pd.DataFrame:
    _ensure_loaded(fingerprint)
    data = raw_df.copy()

    target_col = _metadata["target_col"]
    if target_col in data.columns:
        data = data.drop(columns=[target_col])

    feature_columns = _metadata["feature_columns"]
    data = prep.select_and_order_features(data, feature_columns)

    data = prep.impute_numeric(data, _metadata["numeric_medians"])
    data = prep.impute_categorical(data, _metadata["categorical_cols"], _metadata["categorical_placeholder"])
    data = prep.encode_categoricals_strict(data, _encoders)

    scaled = pd.DataFrame(
        _scaler.transform(data[feature_columns]), columns=feature_columns, index=data.index
    )
    return scaled


def predict(raw_df: pd.DataFrame, fingerprint: str = None) -> pd.DataFrame:
    _ensure_loaded(fingerprint)
    scaled = preprocess(raw_df, fingerprint)
    proba = _model.predict_proba(scaled)[:, 1]
    threshold = _metadata["threshold"]
    prediction = (proba >= threshold).astype(int)

    return pd.DataFrame(
        {
            "churn_probability": proba,
            "churn_prediction": prediction,
            "threshold_used": threshold,
        },
        index=raw_df.index,
    )
