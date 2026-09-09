"""
Structural mirror of backend/artifacts.py, pointed at the generic
pipeline's own artifacts directory. A new file, not a touch to the
existing one -- the two pipelines never share saved state.

Every save/load function takes an optional `fingerprint`. When given, the
artifacts live under a fingerprint-scoped subfolder instead of the flat
top-level path, so a previously-trained dataset's fitted model survives a
*different* dataset being trained afterwards -- without this, the fixed
top-level path would simply be overwritten and "don't retrain the same
dataset again" (see fingerprint.py, dataset_routes.py) would have nothing
to reload. Callers that never pass a fingerprint see the original flat-path
behaviour unchanged.
"""
import os

import joblib

from . import config


def _dir(fingerprint: str = None) -> str:
    return os.path.join(config.ARTIFACTS_DIR, fingerprint) if fingerprint else config.ARTIFACTS_DIR


def _paths(fingerprint: str = None) -> dict:
    base = _dir(fingerprint)
    return {
        "model": os.path.join(base, "model.joblib"),
        "scaler": os.path.join(base, "scaler.joblib"),
        "encoders": os.path.join(base, "encoders.joblib"),
        "background_kmeans": os.path.join(base, "background_kmeans.joblib"),
        "metadata": os.path.join(base, "metadata.joblib"),
    }


def save_artifacts(model, scaler, encoders, background_kmeans, metadata, fingerprint: str = None) -> None:
    paths = _paths(fingerprint)
    os.makedirs(_dir(fingerprint), exist_ok=True)
    joblib.dump(model, paths["model"])
    joblib.dump(scaler, paths["scaler"])
    joblib.dump(encoders, paths["encoders"])
    joblib.dump(background_kmeans, paths["background_kmeans"])
    joblib.dump(metadata, paths["metadata"])


def load_model(fingerprint: str = None):
    return joblib.load(_paths(fingerprint)["model"])


def load_scaler(fingerprint: str = None):
    return joblib.load(_paths(fingerprint)["scaler"])


def load_encoders(fingerprint: str = None):
    return joblib.load(_paths(fingerprint)["encoders"])


def load_background_kmeans(fingerprint: str = None):
    return joblib.load(_paths(fingerprint)["background_kmeans"])


def load_metadata(fingerprint: str = None):
    return joblib.load(_paths(fingerprint)["metadata"])


def is_trained(fingerprint: str = None) -> bool:
    return os.path.exists(_paths(fingerprint)["metadata"])


def artifact_dir(fingerprint: str) -> str:
    """The on-disk folder a given fingerprint's artifacts live in -- what
    gets stored in db.models.TrainedModel.artifact_dir."""
    return _dir(fingerprint)
