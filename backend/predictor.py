"""
Loads the trained model/scaler/encoders and exposes predict(). Mirrors
final_ml_shap.ipynb Cells 3-5 for preprocessing (feature engineering +
label encoding + scaling, minus the SMOTE/train-test-split which are
training-only) and Cell 7 for applying the tuned decision threshold.
"""
import pandas as pd

from . import artifacts
from .feature_engineering import engineer_features

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
    """
    Raw customer rows -> scaled numeric features ready for
    model.predict_proba. Raises ValueError (not a silent fallback) if a
    categorical value wasn't seen during training, or if an expected
    column is missing.
    """
    _ensure_loaded()
    data = engineer_features(raw_df)

    target_col = _metadata["target_col"]
    if target_col in data.columns:
        data = data.drop(columns=[target_col])

    for col, encoder in _encoders.items():
        if col not in data.columns:
            raise ValueError(f"Missing expected column '{col}' required for encoding.")
        values = data[col].astype(str)
        unseen = sorted(set(values) - set(encoder.classes_))
        if unseen:
            raise ValueError(
                f"Unknown value(s) {unseen} for column '{col}'. "
                f"Known values: {sorted(encoder.classes_.tolist())}"
            )
        data[col] = encoder.transform(values)

    feature_columns = _metadata["feature_columns"]
    missing = [c for c in feature_columns if c not in data.columns]
    if missing:
        raise ValueError(f"Missing expected feature column(s): {missing}")
    data = data[feature_columns]

    scaled = pd.DataFrame(_scaler.transform(data), columns=feature_columns, index=data.index)
    return scaled


def predict(raw_df: pd.DataFrame) -> pd.DataFrame:
    """
    Full inference path: raw customer rows -> churn_probability +
    churn_prediction, using the validation-tuned decision threshold
    from Cell 7 (max precision subject to recall >= TARGET_RECALL).
    """
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
