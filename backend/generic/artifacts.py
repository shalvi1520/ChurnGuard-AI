"""
Structural mirror of backend/artifacts.py, pointed at the generic
pipeline's own artifacts directory. A new file, not a touch to the
existing one -- the two pipelines never share saved state.
"""
import os

import joblib

from . import config

MODEL_PATH = os.path.join(config.ARTIFACTS_DIR, "model.joblib")
SCALER_PATH = os.path.join(config.ARTIFACTS_DIR, "scaler.joblib")
ENCODERS_PATH = os.path.join(config.ARTIFACTS_DIR, "encoders.joblib")
BACKGROUND_KMEANS_PATH = os.path.join(config.ARTIFACTS_DIR, "background_kmeans.joblib")
METADATA_PATH = os.path.join(config.ARTIFACTS_DIR, "metadata.joblib")


def save_artifacts(model, scaler, encoders, background_kmeans, metadata) -> None:
    os.makedirs(config.ARTIFACTS_DIR, exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    joblib.dump(encoders, ENCODERS_PATH)
    joblib.dump(background_kmeans, BACKGROUND_KMEANS_PATH)
    joblib.dump(metadata, METADATA_PATH)


def load_model():
    return joblib.load(MODEL_PATH)


def load_scaler():
    return joblib.load(SCALER_PATH)


def load_encoders():
    return joblib.load(ENCODERS_PATH)


def load_background_kmeans():
    return joblib.load(BACKGROUND_KMEANS_PATH)


def load_metadata():
    return joblib.load(METADATA_PATH)


def is_trained() -> bool:
    return os.path.exists(METADATA_PATH)
