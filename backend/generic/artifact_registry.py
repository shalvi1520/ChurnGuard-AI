"""
A versioned store of trained models keyed by schema_hash (see schema_hash.py)
rather than by exact data content -- the mechanism that lets a dataset with
no churn column reuse a model trained earlier on a same-shaped, labeled
export instead of blocking (see dataset_routes.py's
resolve_training_eligibility(), REUSE_MODEL case).

Backed by a JSON manifest + versioned joblib files on disk today
(backend/generic/artifacts/registry/<schema_hash>/v<n>/), one directory per
schema hash so retraining a schema never overwrites an earlier version's
files -- get_latest() always reads the newest, but older versions stay on
disk for now (no pruning yet). The public interface (save/get_latest/
RegistryEntry) is deliberately storage-agnostic so a later move to a
Postgres table (mirroring backend/db/models.py's TrainedModel, which serves
the *content*-fingerprint cache, a different mechanism -- see fingerprint.py)
would only mean rewriting this file, not any caller.
"""
import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import joblib

from . import config

REGISTRY_DIR = os.path.join(config.ARTIFACTS_DIR, "registry")


@dataclass
class RegistryEntry:
    schema_hash: str
    version: int
    model_path: str
    scaler_path: str
    encoders_path: str
    background_kmeans_path: str
    metadata_path: str
    trained_at: str
    metrics: Dict[str, Any]
    feature_columns: List[str]
    reference_stats: Dict[str, Any] = field(default_factory=dict)

    def load_model(self):
        return joblib.load(self.model_path)

    def load_scaler(self):
        return joblib.load(self.scaler_path)

    def load_encoders(self):
        return joblib.load(self.encoders_path)

    def load_background_kmeans(self):
        return joblib.load(self.background_kmeans_path)

    def load_metadata(self) -> dict:
        return joblib.load(self.metadata_path)

    @property
    def cache_key(self) -> str:
        """The sentinel predictor.py/explainer.py's load_from() stores as
        `_loaded_fingerprint` -- pass this same value to preprocess()/
        predict()/explain_customer() so the in-process cache recognises it's
        already loaded instead of trying (and failing) to reload it as a
        content fingerprint. No colons: if the in-process cache later gets
        evicted by a different dataset and something tries to reload this
        key as if it were a real fingerprint path, it must fail as a clean
        "not found" (already handled at every call site), not an OSError
        from an invalid Windows path (colons are a reserved path character
        there)."""
        return f"registry__{self.schema_hash}__v{self.version}"


def _manifest_path(schema_hash: str) -> str:
    return os.path.join(REGISTRY_DIR, schema_hash, "manifest.json")


def _read_manifest(schema_hash: str) -> dict:
    path = _manifest_path(schema_hash)
    if not os.path.exists(path):
        return {"versions": []}
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _write_manifest(schema_hash: str, manifest: dict) -> None:
    os.makedirs(os.path.dirname(_manifest_path(schema_hash)), exist_ok=True)
    with open(_manifest_path(schema_hash), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)


def _entry_from_record(schema_hash: str, record: dict) -> RegistryEntry:
    version_dir = os.path.join(REGISTRY_DIR, schema_hash, record["dir"])
    return RegistryEntry(
        schema_hash=schema_hash,
        version=record["version"],
        model_path=os.path.join(version_dir, "model.joblib"),
        scaler_path=os.path.join(version_dir, "scaler.joblib"),
        encoders_path=os.path.join(version_dir, "encoders.joblib"),
        background_kmeans_path=os.path.join(version_dir, "background_kmeans.joblib"),
        metadata_path=os.path.join(version_dir, "metadata.joblib"),
        trained_at=record["trained_at"],
        metrics=record.get("metrics", {}),
        feature_columns=record.get("feature_columns", []),
        reference_stats=record.get("reference_stats", {}),
    )


def save(
    schema_hash: str,
    model,
    scaler,
    encoders,
    background_kmeans,
    metadata: dict,
    reference_stats: Optional[dict] = None,
) -> int:
    """Writes a new version's artifacts and appends it to the schema's
    manifest. Returns the new version number (1-based, increasing)."""
    manifest = _read_manifest(schema_hash)
    version = (max((v["version"] for v in manifest["versions"]), default=0)) + 1
    version_dir = os.path.join(REGISTRY_DIR, schema_hash, f"v{version}")
    os.makedirs(version_dir, exist_ok=True)

    joblib.dump(model, os.path.join(version_dir, "model.joblib"))
    joblib.dump(scaler, os.path.join(version_dir, "scaler.joblib"))
    joblib.dump(encoders, os.path.join(version_dir, "encoders.joblib"))
    joblib.dump(background_kmeans, os.path.join(version_dir, "background_kmeans.joblib"))
    joblib.dump(metadata, os.path.join(version_dir, "metadata.joblib"))

    manifest["versions"].append({
        "version": version,
        "dir": f"v{version}",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "metrics": metadata.get("test_metrics", {}),
        "feature_columns": metadata.get("feature_columns", []),
        "reference_stats": reference_stats or {},
    })
    _write_manifest(schema_hash, manifest)
    return version


def get_latest(schema_hash: str) -> Optional[RegistryEntry]:
    manifest = _read_manifest(schema_hash)
    if not manifest["versions"]:
        return None
    latest = max(manifest["versions"], key=lambda v: v["version"])
    return _entry_from_record(schema_hash, latest)


def list_versions(schema_hash: str) -> List[RegistryEntry]:
    manifest = _read_manifest(schema_hash)
    return [
        _entry_from_record(schema_hash, record)
        for record in sorted(manifest["versions"], key=lambda v: v["version"])
    ]
