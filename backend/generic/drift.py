"""
Population Stability Index (PSI): decides whether a REUSE_MODEL candidate
(see artifact_registry.py, dataset_routes.py's resolve_training_eligibility)
is still a reasonable fit for newly-connected data, or has drifted enough
that scoring with it would be misleading.

`psi()` is the textbook two-array form, kept exact and pure for testing
(see backend/tests/test_generalization.py). The registry doesn't store a
full copy of the original training data (that would bloat the JSON
manifest for a large dataset), so the *production* path
(compute_reference_stats / psi_against_reference) precomputes and stores
just the quantile bucket edges + reference percentages at training time,
then only needs the new data to reproduce the comparison -- mathematically
the same PSI, without keeping raw training rows around.
"""
import math
from typing import Any, Dict, List

import numpy as np
import pandas as pd

DEFAULT_BUCKETS = 10
MODERATE_DRIFT_THRESHOLD = 0.1
HIGH_DRIFT_THRESHOLD = 0.25


def psi(reference: np.ndarray, current: np.ndarray, buckets: int = DEFAULT_BUCKETS) -> float:
    edges = np.quantile(reference, np.linspace(0, 1, buckets + 1))
    edges[0], edges[-1] = -np.inf, np.inf
    ref_pct = np.histogram(reference, edges)[0] / len(reference)
    cur_pct = np.histogram(current, edges)[0] / len(current)
    ref_pct, cur_pct = np.clip(ref_pct, 1e-4, None), np.clip(cur_pct, 1e-4, None)
    return float(np.sum((cur_pct - ref_pct) * np.log(cur_pct / ref_pct)))


def compute_reference_stats(
    df: pd.DataFrame, feature_cols: List[str], buckets: int = DEFAULT_BUCKETS
) -> Dict[str, Any]:
    """Per-numeric-feature quantile edges + bucket percentages from training
    data, saved into the registry (artifact_registry.save's `reference_stats`)
    so a later drift check needs no copy of the original rows."""
    stats: Dict[str, Any] = {}
    for col in feature_cols:
        if col not in df.columns or not pd.api.types.is_numeric_dtype(df[col]):
            continue
        values = df[col].dropna().to_numpy(dtype=float)
        if len(values) < buckets:
            continue
        edges = np.quantile(values, np.linspace(0, 1, buckets + 1))
        edges[0], edges[-1] = -math.inf, math.inf
        ref_pct = np.histogram(values, edges)[0] / len(values)
        stats[col] = {"edges": edges.tolist(), "ref_pct": ref_pct.tolist()}
    return stats


def psi_against_reference(reference_stats: Dict[str, Any], current_df: pd.DataFrame) -> Dict[str, float]:
    """PSI per feature that has stored reference stats and is present in
    `current_df`. Features with no overlap (e.g. an extra column this
    dataset happens not to have) are silently skipped, not treated as
    drift -- there's nothing to compare."""
    results: Dict[str, float] = {}
    for col, ref in reference_stats.items():
        if col not in current_df.columns:
            continue
        values = pd.to_numeric(current_df[col], errors="coerce").dropna().to_numpy(dtype=float)
        if len(values) == 0:
            continue
        edges = np.array(ref["edges"])
        ref_pct = np.clip(np.array(ref["ref_pct"]), 1e-4, None)
        cur_pct = np.clip(np.histogram(values, edges)[0] / len(values), 1e-4, None)
        results[col] = float(np.sum((cur_pct - ref_pct) * np.log(cur_pct / ref_pct)))
    return results


def drift_severity(per_feature_psi: Dict[str, float]) -> str:
    """'none' | 'moderate' | 'high', driven by the single worst-drifted
    feature -- a blended average would let one badly-shifted but important
    feature hide behind several stable ones."""
    if not per_feature_psi:
        return "none"
    worst = max(per_feature_psi.values())
    if worst > HIGH_DRIFT_THRESHOLD:
        return "high"
    if worst > MODERATE_DRIFT_THRESHOLD:
        return "moderate"
    return "none"
