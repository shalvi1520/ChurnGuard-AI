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
