"""
The one place a table of customer records becomes a ChurnGuard dataset.

An uploaded CSV/Excel file and a CRM import both land here, so from this point
on there is a single code path: profile -> automatic matching -> validation ->
training -> prediction -> dashboard. Nothing downstream can tell how the data
arrived, which is exactly the point (see backend/connectors/base.py).
"""
import time
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from fastapi import HTTPException

from . import profiling
from .store import DatasetEntry, DatasetSource, create_dataset


class IngestError(Exception):
    """Something about the data itself stops us reading it. `hint` says what to do."""

    def __init__(self, message: str, hint: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.hint = hint


def check_shape(df: pd.DataFrame) -> None:
    """The three ways a table can be unusable before we even look at columns."""
    if df.shape[1] == 0:
        raise IngestError(
            "That file appears to be empty.",
            "Export your customer list again and make sure it has a header row plus at least one customer.",
        )
    if df.shape[1] < 2:
        raise IngestError(
            "We couldn't split that data into columns.",
            "Check that the first row names each column, and that a CSV export used commas as the separator.",
        )
    if df.shape[0] == 0:
        raise IngestError(
            "This data has column headers but no customer rows.",
            "Check that the export actually included your data, then try again.",
        )


def apply_provider_field_map(df: pd.DataFrame, field_map: Dict[str, str]) -> List[str]:
    """Renames provider-native columns to ChurnGuard field names where the
    connector already knows the meaning, so a known CRM needs no guessing.

    Only the first provider column claiming a given field wins, and a rename is
    skipped if the target name is already taken -- we never silently replace a
    column the user actually has.
    """
    if not field_map:
        return []
    renames: Dict[str, str] = {}
    claimed = set()
    for provider_column, field_key in field_map.items():
        if provider_column not in df.columns or field_key in claimed or field_key in df.columns:
            continue
        renames[provider_column] = field_key
        claimed.add(field_key)
    if renames:
        df.rename(columns=renames, inplace=True)
    return [f"{src} → {dst}" for src, dst in renames.items()]


def _has_usable_id_column(df: pd.DataFrame) -> bool:
    """True when at least one column is unique per row -- the same 'value
    evidence' signal mapping.py's own customer_id matcher relies on. Checked
    independently here, before any mapping analysis exists yet, so ingest.py
    can decide whether a file needs a synthetic ID without depending on --
    or duplicating -- mapping.py's full scoring logic."""
    if len(df) == 0:
        return False
    return any(df[col].nunique(dropna=True) == len(df) for col in df.columns)


def _add_synthetic_customer_id(df: pd.DataFrame) -> pd.DataFrame:
    """Some real exports (e.g. certain e-commerce churn datasets) have no
    identifier column at all -- every column is a genuine feature, none is
    unique per row. Rather than hard-blocking a file that is otherwise
    perfectly usable, a sequential per-row ID is generated and named exactly
    'customer_id' so mapping.py's own exact-name match picks it up with high
    confidence, same as if the file had shipped with one. This never
    fabricates customer data -- it's a row handle, not a claim about the
    business -- but the resulting IDs are positional and won't line up with
    the same customers if this file is re-uploaded later; that limitation is
    surfaced as a note, not hidden."""
    out = df.copy()
    out.insert(0, "customer_id", [f"ROW-{i + 1:06d}" for i in range(len(out))])
    return out


def register_dataframe(
    df: pd.DataFrame,
    filename: str,
    size: int,
    source: DatasetSource,
) -> Tuple[DatasetEntry, List[str]]:
    """Profiles the table and stores it as the active dataset. Returns the
    entry plus any notes worth surfacing to the user (e.g. a synthesized ID
    column) -- distinct from IngestError, since these are informational, not
    reasons the file was rejected."""
    check_shape(df)

    notes: List[str] = []
    if not _has_usable_id_column(df):
        df = _add_synthetic_customer_id(df)
        notes.append(
            "This file has no identifier column, so ChurnGuard generated one "
            "(customer_id) from each row's position. Predictions are still "
            "per-customer, but re-uploading this data later will not "
            "reconnect the same IDs -- add a real ID column in your export "
            "if you need that."
        )

    # Profiled as strings so missing-value detection follows one consistent
    # token rule ("", "n/a", "null", ...); the typed frame stays in raw_df.
    profile = profiling.profile_dataframe(df.astype(str).where(df.notna(), ""))

    entry = DatasetEntry(
        id=f"DS-{int(time.time() * 1000)}",
        filename=filename,
        size=size,
        raw_df=df,
        profile=profile,
        source=source,
    )
    create_dataset(entry)
    return entry, notes


def describe_entry(entry: DatasetEntry, notes: Optional[List[str]] = None) -> Dict[str, Any]:
    """The response shape the frontend gets after an upload or a CRM import."""
    return {
        "id": entry.id,
        "filename": entry.filename,
        "rows": entry.profile["rowCount"],
        "columns": entry.profile["columnCount"],
        "size": entry.size,
        "source": entry.source.as_dict(),
        "notes": notes or [],
        "status": "connected",
    }


def as_http_error(exc: IngestError) -> HTTPException:
    """IngestError carries a message and a hint; the frontend renders both."""
    detail = exc.message if not exc.hint else f"{exc.message} {exc.hint}"
    return HTTPException(400, detail)