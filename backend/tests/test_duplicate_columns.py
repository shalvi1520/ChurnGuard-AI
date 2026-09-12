"""
Regression tests for duplicate column names reaching the trainer.

A live /predict crashed with:

    AttributeError: 'DataFrame' object has no attribute 'dtype'
    at _clean_model_frame: model_df[c].dtype

which is what pandas does when `model_df` has two columns of the same
name -- `model_df[c]` returns a DataFrame, not a Series. The message names
neither the column nor the cause, so the cost of letting this reach
production again is high relative to the cost of these tests.

The source was the rename to canonical field names, not feature_cols
assembly: renaming `tenure_months` -> `tenure` collides when the data
already contains a column called `tenure`. Rare against a fixed column
list; likely once the HubSpot connector started discovering every property
a portal defines.
"""
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.api.dataset_routes import (
    MODEL_FEATURE_KEYS,
    OPTIONAL_FEATURE_KEYS,
    _canonicalize_columns,
    _dedupe_preserving_order,
)
from backend.api.main import app
from backend.generic import artifact_registry


@pytest.fixture(autouse=True)
def isolated_registry(tmp_path, monkeypatch):
    monkeypatch.setattr(artifact_registry, "REGISTRY_DIR", str(tmp_path / "registry"))
    yield


@pytest.fixture
def client():
    return TestClient(app)


def _columns_of(df: pd.DataFrame) -> list:
    return list(df.columns)


def _duplicates(names) -> list:
    seen, dupes = set(), []
    for n in names:
        if n in seen and n not in dupes:
            dupes.append(n)
        seen.add(n)
    return dupes


# ------------------------------------------------------- the crash itself --

def test_canonicalize_resolves_the_exact_reported_collision():
    """`tenure` present AND `tenure_months` mapped to tenure -- the shape
    that produced the live AttributeError."""
    raw = pd.DataFrame({
        "email": ["a", "b"],
        "tenure": ["x", "y"],
        "tenure_months": [12, 5],
        "churned": [1, 0],
    })
    field_to_col = {"customer_id": "email", "tenure": "tenure_months", "churn": "churned"}

    df, displaced = _canonicalize_columns(raw, field_to_col)

    assert _duplicates(_columns_of(df)) == []
    assert isinstance(df["tenure"], pd.Series), "df[col] must be a Series, not a DataFrame"
    # The mapped column wins the canonical name; the collider survives aside.
    assert df["tenure"].tolist() == [12, 5]
    assert displaced == [
        {"column": "tenure", "renamedTo": "tenure_original", "mappedFrom": "tenure_months"}
    ]
    assert df["tenure_original"].tolist() == ["x", "y"], "displaced data must not be lost"


def test_canonicalize_leaves_non_colliding_frames_untouched():
    raw = pd.DataFrame({"email": ["a"], "tenure": [3], "churned": [0]})
    df, displaced = _canonicalize_columns(
        raw, {"customer_id": "email", "tenure": "tenure", "churn": "churned"}
    )
    assert _columns_of(df) == ["customer_id", "tenure", "churn"]
    assert displaced == []


def test_name_being_renamed_away_is_not_a_collision():
    """`tenure` exists but is itself mapped to service_tier, so it vacates
    the name -- nothing needs displacing."""
    raw = pd.DataFrame({"email": ["a"], "tenure": [3], "months": [9], "churned": [0]})
    df, displaced = _canonicalize_columns(
        raw,
        {"customer_id": "email", "service_tier": "tenure", "tenure": "months", "churn": "churned"},
    )
    assert _duplicates(_columns_of(df)) == []
    assert displaced == []
    assert df["service_tier"].tolist() == [3]
    assert df["tenure"].tolist() == [9]


def test_dedupe_preserves_first_occurrence_order():
    assert _dedupe_preserving_order(["a", "b", "a", "c", "b"]) == ["a", "b", "c"]


# ------------------------------- the requested absent-optional-fields case --

def test_no_duplicates_when_optional_feature_fields_are_all_absent():
    """The condition named in the bug report: a frame carrying none of
    tenure / monthly_charges / contract_type as raw columns.

    Note MODEL_FEATURE_KEYS and OPTIONAL_FEATURE_KEYS are disjoint, so
    feature_cols cannot duplicate through the required/optional split --
    asserted here so a future edit that overlaps them fails loudly rather
    than resurfacing as an unreadable pandas error.
    """
    assert not (set(MODEL_FEATURE_KEYS) & set(OPTIONAL_FEATURE_KEYS)), (
        "MODEL_FEATURE_KEYS and OPTIONAL_FEATURE_KEYS must stay disjoint; overlapping them "
        "puts the same column into feature_cols twice"
    )

    raw = pd.DataFrame({
        "user_id": ["u1", "u2", "u3"],
        "avg_daily_minutes": [10.5, 20.0, 33.2],
        "skips_per_session": [1, 4, 2],
        "churned": [0, 1, 0],
    })
    field_to_col = {"customer_id": "user_id", "churn": "churned"}

    df, displaced = _canonicalize_columns(raw, field_to_col)
    assert _duplicates(_columns_of(df)) == []
    assert displaced == []

    present_optional = [f for f in OPTIONAL_FEATURE_KEYS if f in field_to_col]
    feature_cols = MODEL_FEATURE_KEYS + present_optional
    assert _duplicates(feature_cols) == [], feature_cols

    extras = [c for c in df.columns if c not in set(feature_cols) | {"customer_id", "churn"}]
    all_feature_cols = _dedupe_preserving_order(feature_cols + extras)
    assert _duplicates(all_feature_cols) == []

    selected = _dedupe_preserving_order(["customer_id", "churn"] + all_feature_cols)
    present = [c for c in selected if c in df.columns]
    assert _duplicates(_columns_of(df[present])) == []


# --------------------------------------------------------------- end-to-end --

def test_predict_survives_a_column_named_like_a_canonical_field(client):
    """Full /predict against data containing both `tenure` and a column the
    matcher maps to tenure. Before the fix this died inside
    _clean_model_frame with the AttributeError above."""
    rng = np.random.default_rng(5150)
    n = 45
    frame = pd.DataFrame({
        "CustID": [f"C{i:04d}" for i in range(n)],
        # A raw column literally named `tenure`, holding something else.
        "tenure": rng.choice(["alpha", "beta", "gamma"], size=n),
        "MonthsActive": rng.integers(1, 72, size=n),
        "Contract": rng.choice(["Month-to-month", "One year"], size=n),
        "Churned": rng.choice(["Yes", "No"], p=[0.35, 0.65], size=n),
    })

    resp = client.post(
        "/api/datasets/upload",
        files={"file": ("collision.csv", frame.to_csv(index=False).encode(), "text/csv")},
    )
    assert resp.status_code == 200, resp.text
    dataset_id = resp.json()["id"]

    validation = client.post(f"/api/datasets/{dataset_id}/validate").json()
    mappings = validation["mapping"]["autoMappings"]
    payload = {col: key for key, col in mappings.items()}
    resp = client.post(f"/api/datasets/{dataset_id}/map-columns", json={"mappings": payload})
    assert resp.status_code == 200, resp.text

    resp = client.post(f"/api/datasets/{dataset_id}/predict")
    assert resp.status_code == 200, resp.text
    assert resp.json()["customersProcessed"] == n
