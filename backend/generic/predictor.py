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


def _ensure_loaded() -> None:
    global _model, _scaler, _encoders, _metadata
    if _model is None:
        _model = artifacts.load_model()
        _scaler = artifacts.load_scaler()
        _encoders = artifacts.load_encoders()
        _metadata = artifacts.load_metadata()


def reset_cache() -> None:
    """Drops the in-process model cache so the next predict() re-reads the
    artifacts from disk.

    This MUST be called after training writes new artifacts. The cache is
    keyed on nothing but "have we loaded yet", so in a long-running server a
    second training run would otherwise keep scoring with the *first* model:
    the user connects a new dataset, a new model is genuinely trained and its
    metrics reported, but every customer is scored by the previous dataset's
    model. That produces a dashboard that silently doesn't match the data.
    """
    global _model, _scaler, _encoders, _metadata
    _model = _scaler = _encoders = _metadata = None


def preprocess(raw_df: pd.DataFrame) -> pd.DataFrame:
    _ensure_loaded()
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


def predict(raw_df: pd.DataFrame) -> pd.DataFrame:
    _ensure_loaded()
    scaled = preprocess(raw_df)
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
