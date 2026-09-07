"""
In-memory store for uploaded datasets and everything derived from them
(customer records, cached SHAP drivers, cached top-driver aggregate,
outreach drafts). One process-lifetime store, one active dataset at a
time -- mirrors the `uploadedDatasets` Map the frontend already used in
mock mode (services/api.js), just moved server-side now that predictions
are real. No database: restarting the backend clears everything, which
matches the "uploads are session-only" language already in the UI.
"""
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import pandas as pd


@dataclass
class DatasetEntry:
    id: str
    filename: str
    size: int
    raw_df: pd.DataFrame
    profile: Dict[str, Any]
    uploaded_at: float = field(default_factory=time.time)
    mappings: Optional[Dict[str, str]] = None  # { yourColumnName: churnguardFieldKey }
    trained: bool = False
    training_report: Optional[Dict[str, Any]] = None

    customers: List[Dict[str, Any]] = field(default_factory=list)
    customers_by_id: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    # customer_id -> the raw (pre-encoding) feature dict used to train/predict,
    # kept so a later explain call can rebuild a one-row frame on demand.
    raw_features_by_id: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    # Lazily computed & cached per customer_id once first requested.
    raw_drivers: Dict[str, List[Dict[str, Any]]] = field(default_factory=dict)
    explanation_base_value: Dict[str, float] = field(default_factory=dict)
    ai_explanations: Dict[str, str] = field(default_factory=dict)

    # Computed once, right after training, on a capped sample.
    top_drivers: Optional[List[Dict[str, Any]]] = None

    outreach_drafts: List[Dict[str, Any]] = field(default_factory=list)


DATASETS: Dict[str, DatasetEntry] = {}
CURRENT_ID: Optional[str] = None


def create_dataset(entry: DatasetEntry) -> None:
    global CURRENT_ID
    DATASETS[entry.id] = entry
    CURRENT_ID = entry.id


def get_dataset(dataset_id: str) -> Optional[DatasetEntry]:
    return DATASETS.get(dataset_id)


def get_current() -> Optional[DatasetEntry]:
    if CURRENT_ID is None:
        return None
    return DATASETS.get(CURRENT_ID)
