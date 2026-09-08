"""
In-memory store for connected datasets and everything derived from them
(customer records, cached SHAP drivers, cached top-driver aggregate,
outreach drafts). One process-lifetime store, one active dataset at a
time. No database: restarting the backend clears everything, which matches
the "uploads are session-only" language already in the UI.

`source` records where the data actually came from -- an uploaded file, the
demo dataset, or a CRM connector -- so the UI can label the data source
honestly instead of guessing.
"""
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import pandas as pd


@dataclass
class DatasetSource:
    """Where this dataset came from. `kind` is 'upload', 'demo' or 'crm'."""
    kind: str = "upload"
    label: str = "Uploaded file"
    provider: Optional[str] = None  # connector id, when kind == 'crm'
    detail: Optional[str] = None    # e.g. the CRM object that was imported

    def as_dict(self) -> Dict[str, Any]:
        return {"kind": self.kind, "label": self.label, "provider": self.provider, "detail": self.detail}


@dataclass
class DatasetEntry:
    id: str
    filename: str
    size: int
    raw_df: pd.DataFrame
    profile: Dict[str, Any]
    source: DatasetSource = field(default_factory=DatasetSource)
    uploaded_at: float = field(default_factory=time.time)
    mappings: Optional[Dict[str, str]] = None  # { yourColumnName: churnguardFieldKey }
    trained: bool = False
    training_report: Optional[Dict[str, Any]] = None
    # What preprocessing actually did to the data, so the UI can say so
    # truthfully: [{action, count, detail}]. Only ever filled with operations
    # that really ran.
    cleaning: List[Dict[str, Any]] = field(default_factory=list)

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

    def mapped_field_keys(self) -> List[str]:
        return sorted({v for v in (self.mappings or {}).values() if v})

    def summary(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "filename": self.filename,
            "rows": self.profile["rowCount"],
            "columns": self.profile["columnCount"],
            "source": self.source.as_dict(),
            "trained": self.trained,
            "customers": len(self.customers),
            "mappedFields": self.mapped_field_keys(),
        }


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


def reset() -> None:
    """Drops every stored dataset. Used by 'replace dataset' so a stale
    training run can't outlive the data it was built from."""
    global CURRENT_ID
    DATASETS.clear()
    CURRENT_ID = None
