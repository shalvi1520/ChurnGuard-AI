"""
Case B of resolve_training_eligibility() (see dataset_routes.py): when a
dataset has no churn/cancellation column ChurnGuard's matcher recognises,
these are the three fallback rules that can build one -- checked in this
priority order, first match wins, per churnguard_generalization_fix_prompt.md:

  1. status column   -- a status/state column whose values overlap the
                         churn-adjacent vocabulary (cancelled, expired,
                         inactive, terminated, ...) vs. the active-adjacent
                         one (active, current, retained, ...). Broader than
                         mapping.py's own churn-field value-evidence check,
                         which only recognises an exact 2-value pair from a
                         fixed list (_BINARY_VALUE_SETS) -- this also
                         catches Expired/Current-style pairs it doesn't
                         know, and status columns with 3+ values (Active/
                         Trial/Cancelled/Suspended), not just clean binaries.
  2. cancellation date -- a column that only holds a value once an account
                         has actually been cancelled: non-blank = churned,
                         blank = still active. Different from rule 3: here
                         a blank is itself the "still active" signal, not
                         missing data.
  3. last activity     -- a last-login/last-session date, thresholded
                         against the most recent date in the file. The
                         weakest signal of the three (an inactivity proxy,
                         not a recorded event), so it's the last resort.

Detection (does a plausible candidate exist) works off the profiled column
stats alone, matching mapping.py's style. Derivation (turning a chosen
candidate into an actual churn Series) needs the real data and lives here
too, since the two are tightly coupled and dataset_routes.py just wants
"give me a column and a threshold, hand back a Series".

Nothing here is ever applied automatically -- see dataset_routes.py's
POST /datasets/{id}/derive-churn and the frontend's confirm-before-use flow
(src/components/data-setup/IssueList.jsx). Detection only ever produces a
suggestion.
"""
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from . import mapping, profiling, schema

CHURN_ADJACENT_VALUES = {
    "cancelled", "canceled", "churned", "churn", "expired", "inactive",
    "terminated", "lost", "closed", "deactivated", "unsubscribed", "left",
    "suspended", "lapsed",
}
ACTIVE_ADJACENT_VALUES = {
    "active", "current", "retained", "subscribed", "open", "ongoing", "live",
}

_STATUS_MIN_DISTINCT = 2
_STATUS_MAX_DISTINCT = 12

_CANCELLATION_DATE_ALIASES = {
    "cancellationdate", "canceldate", "canceleddate", "cancelleddate",
    "terminationdate", "termdate", "churndate", "enddate", "endedat",
    "deactivationdate", "deactivateddate", "closeddate", "closedate",
    "expirydate", "expirationdate", "unsubscribedate", "unsubscribeddate",
    "cancelationdate", "cancelledon", "canceledon", "churnedon", "leftdate",
}


# ------------------------------------------------------------- detection --

def _unclaimed_columns(profile: Dict[str, Any], analysis: Dict[str, Any]) -> List[Dict[str, Any]]:
    claimed = {f["column"] for f in analysis["fields"] if f["column"]}
    return [c for c in profile["columns"] if c["name"] not in claimed]


def detect_status_column(profile: Dict[str, Any], analysis: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    best = None
    for column in _unclaimed_columns(profile, analysis):
        distinct = column.get("distinctValues") or []
        if not (_STATUS_MIN_DISTINCT <= len(distinct) <= _STATUS_MAX_DISTINCT):
            continue
        normalized = {v.strip().lower() for v in distinct}
        churn_hits = normalized & CHURN_ADJACENT_VALUES
        if not churn_hits:
            continue
        active_hits = normalized & ACTIVE_ADJACENT_VALUES
        candidate = {
            "rule": "status_column",
            "column": column["name"],
            "churnValues": sorted(churn_hits),
            "activeValues": sorted(active_hits),
            "allValues": sorted(normalized),
        }
        # Prefer a candidate where both sides of the vocabulary are present
        # (a cleaner signal than churn-side-only, where everything else is
        # assumed active by elimination).
        if active_hits or best is None:
            best = candidate
            if active_hits:
                break
    return best


def detect_cancellation_date(profile: Dict[str, Any], analysis: Dict[str, Any]) -> Optional[str]:
    for column in _unclaimed_columns(profile, analysis):
        if schema.normalize_column_name(column["name"]) in _CANCELLATION_DATE_ALIASES:
            return column["name"]
    return None


def detect_last_activity(profile: Dict[str, Any]) -> Optional[str]:
    return mapping.find_recency_candidate(profile)


def detect_candidates(profile: Dict[str, Any], analysis: Dict[str, Any]) -> List[Dict[str, Any]]:
    """All plausible derive-label candidates, in priority order (first
    matching rule wins per the spec) -- used both to decide DERIVE_LABEL
    eligibility and to tell the frontend what to offer."""
    candidates: List[Dict[str, Any]] = []
    status = detect_status_column(profile, analysis)
    if status:
        candidates.append(status)
    cancel_date = detect_cancellation_date(profile, analysis)
    if cancel_date:
        candidates.append({"rule": "cancellation_date", "column": cancel_date})
    last_activity = detect_last_activity(profile)
    if last_activity:
        candidates.append({"rule": "last_activity", "column": last_activity})
    return candidates


# ------------------------------------------------------------ derivation --

def derive_from_status_column(df: pd.DataFrame, column: str, churn_values: List[str]) -> pd.Series:
    """Blank stays unresolved (excluded from training as a missing label,
    same as any other missing churn value) rather than guessed either way."""
    raw = df[column].astype(str).str.strip()
    blank = raw.str.lower().isin(profiling.MISSING_TOKENS)
    normalized = raw.str.lower()
    is_churn = normalized.isin(set(churn_values))
    result = pd.Series("", index=df.index, dtype=object)
    result.loc[~blank] = np.where(is_churn[~blank], "Yes", "No")
    return result


def derive_from_cancellation_date(df: pd.DataFrame, column: str) -> pd.Series:
    """Unlike the other two rules, a blank here IS the signal (never
    cancelled = active), not missing data -- so every row resolves, none
    are excluded."""
    raw = df[column].astype(str).str.strip()
    blank = raw.str.lower().isin(profiling.MISSING_TOKENS)
    return pd.Series(np.where(blank, "No", "Yes"), index=df.index, dtype=object)


def derive_from_last_activity(df: pd.DataFrame, column: str, inactivity_days: int):
    """Returns (series, reference_date_iso). A row whose date doesn't parse
    stays unresolved (excluded from training), same rule as
    dataset_routes.py's original POST /derive-churn."""
    parsed = pd.to_datetime(df[column], errors="coerce")
    valid_ratio = float(parsed.notna().mean()) if len(parsed) else 0.0
    if valid_ratio < 0.5:
        raise ValueError(
            f'"{column}" doesn\'t look like a column of dates — only '
            f"{valid_ratio * 100:.0f}% of its values could be read as one."
        )
    reference_date = parsed.max()
    days_inactive = (reference_date - parsed).dt.days
    known = days_inactive.notna()
    result = pd.Series("", index=df.index, dtype=object)
    result.loc[known] = np.where(days_inactive.loc[known] >= inactivity_days, "Yes", "No")
    reference_iso = reference_date.date().isoformat() if pd.notna(reference_date) else None
    return result, reference_iso


def derive(df: pd.DataFrame, rule: str, column: str, **kwargs) -> Dict[str, Any]:
    """Single entry point dataset_routes.py's POST /derive-churn calls --
    dispatches to the right rule and returns a uniform
    {series, reference_date, note} so the caller doesn't need a rule-shaped
    switch of its own."""
    if rule == "status_column":
        churn_values = kwargs.get("churn_values") or []
        series = derive_from_status_column(df, column, churn_values)
        note = f"treated as churned: {', '.join(churn_values)}" if churn_values else None
        return {"series": series, "reference_date": None, "note": note}
    if rule == "cancellation_date":
        series = derive_from_cancellation_date(df, column)
        return {"series": series, "reference_date": None, "note": "a value in this column means cancelled"}
    if rule == "last_activity":
        inactivity_days = int(kwargs.get("inactivity_days") or 60)
        series, reference_date = derive_from_last_activity(df, column, inactivity_days)
        return {
            "series": series,
            "reference_date": reference_date,
            "note": f"inactive {inactivity_days}+ days as of {reference_date}",
        }
    raise ValueError(f"Unknown derive rule: {rule!r}")
