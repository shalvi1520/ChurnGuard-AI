"""
Tests for churnguard_generalization_fix_prompt.md's Step 8 list: schema
hashing, the versioned artifact registry, resolve_training_eligibility()'s
four states, and the PSI drift function. Each test isolates the registry to
a temp directory (monkeypatched onto artifact_registry.REGISTRY_DIR) so runs
don't accumulate real artifacts or depend on what a previous test run left
behind -- a real risk with a genuinely persistent, file-based registry.

Run with: python -m pytest backend/tests/test_generalization.py -v
"""
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.generic import artifact_registry, drift, schema_hash


@pytest.fixture(autouse=True)
def isolated_registry(tmp_path, monkeypatch):
    """Every test gets its own empty registry directory -- REUSE_MODEL tests
    must never see another test's (or a prior manual run's) leftover models."""
    monkeypatch.setattr(artifact_registry, "REGISTRY_DIR", str(tmp_path / "registry"))
    yield


@pytest.fixture
def client():
    return TestClient(app)


def _synthetic_dataset(seed: int, n: int, **extra_columns) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []
    for i in range(n):
        row = {
            "CustID": f"S{seed}-{i:04d}",
            "MonthsActive": int(rng.integers(1, 72)),
            "Contract": rng.choice(["Month-to-month", "One year", "Two year"]),
        }
        for key, values in extra_columns.items():
            row[key] = values[i] if isinstance(values, (list, np.ndarray)) else values(rng)
        rows.append(row)
    return pd.DataFrame(rows)


def _upload_validate(client, df: pd.DataFrame, name: str) -> dict:
    resp = client.post("/api/datasets/upload", files={"file": (name, df.to_csv(index=False).encode(), "text/csv")})
    assert resp.status_code == 200
    dataset_id = resp.json()["id"]
    validation = client.post(f"/api/datasets/{dataset_id}/validate").json()
    return {"id": dataset_id, "validation": validation}


def _reuse_slice_of(frame: pd.DataFrame, n: int) -> pd.DataFrame:
    """An unlabelled frame drawn from the same population as `frame`.

    A REUSE_MODEL test must not accidentally be a drift test. At these row
    counts (~4-6 rows per bin over PSI's 10 bins) two *independent* draws of
    the same distribution measure as PSI > 1.0, so the drift gate declines
    the reuse and the path under test never runs -- a latent flake that
    happened to pass only because of the particular seeds chosen. Sampling
    from the training frame keeps the distributions genuinely comparable.
    """
    sampled = frame.sample(n=n, random_state=7).drop(columns=["Churned"]).reset_index(drop=True)
    sampled["CustID"] = [f"R-{i:04d}" for i in range(len(sampled))]
    return sampled


def _train_has_target(client, seed: int, n: int = 40) -> tuple[str, pd.DataFrame]:
    """Uploads a small labeled dataset (customer_id, tenure, contract_type,
    churn) and trains it for real -- fast: n_trials is capped low by
    dataset_routes.py's PREDICT_N_TRIALS regardless, and 40 rows keeps the
    stacking fit itself quick.

    Returns (dataset_id, the frame it trained on) -- the frame so a
    REUSE_MODEL test can slice its unlabelled input from the same draw
    rather than generating an independent one (see _reuse_slice_of)."""
    df = _synthetic_dataset(
        seed, n,
        Churned=lambda r: r.choice(["Yes", "No"], p=[0.35, 0.65]),
    )
    uploaded = _upload_validate(client, df, f"seed{seed}.csv")
    mappings = uploaded["validation"]["mapping"]["autoMappings"]
    assert "churn" in mappings, "fixture dataset must auto-map churn for HAS_TARGET setup"
    payload = {col: key for key, col in mappings.items()}
    resp = client.post(f"/api/datasets/{uploaded['id']}/map-columns", json={"mappings": payload})
    assert resp.status_code == 200
    resp = client.post(f"/api/datasets/{uploaded['id']}/predict")
    assert resp.status_code == 200, resp.text
    return uploaded["id"], df


# --------------------------------------------------------------- Test 1 ---
# Same schema, second file, no churn column, model exists -> REUSE_MODEL,
# no training call made.

def test_reuse_model_when_schema_matches_and_no_churn_column(client, monkeypatch):
    _dataset_id, trained_frame = _train_has_target(client, seed=1)

    def _fail_if_trained(*args, **kwargs):
        raise AssertionError("train_generic_model must not be called on a REUSE_MODEL connect")

    from backend.generic import trainer as generic_trainer
    monkeypatch.setattr(generic_trainer, "train_generic_model", _fail_if_trained)

    # Same canonical shape, no churn column, same population -- see
    # _reuse_slice_of on why this must not be an independent draw.
    unlabeled = _reuse_slice_of(trained_frame, n=30)
    uploaded = _upload_validate(client, unlabeled, "unlabeled.csv")
    assert uploaded["validation"]["eligibility"]["state"] == "REUSE_MODEL"
    assert uploaded["validation"]["status"] == "ready"
    assert uploaded["validation"]["issues"] == []

    mappings = uploaded["validation"]["mapping"]["autoMappings"]
    assert "churn" not in mappings
    payload = {col: key for key, col in mappings.items()}
    resp = client.post(f"/api/datasets/{uploaded['id']}/map-columns", json={"mappings": payload})
    assert resp.status_code == 200

    resp = client.post(f"/api/datasets/{uploaded['id']}/predict")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["trainingSource"] == "reused"
    assert body["labelledChurnCount"] is None
    assert body["customersProcessed"] == 30
    assert all(c["churned"] is None for c in client.get("/api/customers?pageSize=30").json()["customers"])


# ------------------------------------------------------- extra: Step 4 ---
# PSI > 0.25 must actually change the eligibility decision (Step 4: "force
# retrain if labels are available, else fall back per the rules above"),
# not just annotate a REUSE_MODEL response after the fact.

def test_high_drift_declines_reuse_and_falls_back(client, monkeypatch):
    _train_has_target(client, seed=7)  # tenure ~ integers in [1, 72)

    def _fail_if_trained(*args, **kwargs):
        raise AssertionError("a declined REUSE_MODEL candidate must not silently train either")

    from backend.generic import trainer as generic_trainer
    monkeypatch.setattr(generic_trainer, "train_generic_model", _fail_if_trained)

    # Same canonical shape, no churn column, but tenure is wildly out of the
    # range the reused candidate was trained on -- high PSI is expected.
    rng = np.random.default_rng(8)
    drifted = pd.DataFrame({
        "CustID": [f"D{i:04d}" for i in range(40)],
        "MonthsActive": rng.integers(900, 1000, size=40),
        "Contract": rng.choice(["Month-to-month", "One year", "Two year"], size=40),
    })
    uploaded = _upload_validate(client, drifted, "drifted.csv")
    assert uploaded["validation"]["eligibility"]["state"] != "REUSE_MODEL", uploaded["validation"]["eligibility"]


# --------------------------------------------------------------- Test 2 ---
# Same schema, no churn column, no model exists, has a status column ->
# DERIVE_LABEL, confirmation payload returned with correct derived counts.

def test_derive_label_status_column(client):
    # Deliberately NOT an exact pair mapping.py's own matcher already knows
    # (e.g. Active/Cancelled) -- a 3+-value status column is exactly what
    # the status_column rule adds over the pre-existing heuristic matcher,
    # which only recognises a clean 2-value pair from a fixed list.
    rng = np.random.default_rng(3)
    statuses = rng.choice(["Active", "Trial", "Cancelled", "Suspended"], size=50, p=[0.5, 0.2, 0.2, 0.1])
    df = _synthetic_dataset(seed=3, n=50, MonthlySpend=lambda r: round(float(r.uniform(10, 200)), 2))
    df["Status"] = statuses
    uploaded = _upload_validate(client, df, "status.csv")

    eligibility = uploaded["validation"]["eligibility"]
    assert eligibility["state"] == "DERIVE_LABEL"
    assert eligibility["suggestion"]["rule"] == "status_column"
    assert eligibility["suggestion"]["column"] == "Status"
    assert set(eligibility["suggestion"]["churnValues"]) == {"cancelled", "suspended"}

    resp = client.post(
        f"/api/datasets/{uploaded['id']}/derive-churn",
        json={"rule": "status_column", "column": "Status", "churn_values": ["cancelled", "suspended"]},
    )
    assert resp.status_code == 200
    derivation = resp.json()["derivation"]
    expected_churned = int(np.isin(statuses, ["Cancelled", "Suspended"]).sum())
    assert derivation["churnedCount"] == expected_churned
    assert derivation["activeCount"] == 50 - expected_churned
    assert derivation["excludedCount"] == 0


# --------------------------------------------------------------- Test 3 ---
# Same schema, no churn column, no model, nothing derivable -> BLOCKED.

def test_blocked_when_nothing_derivable(client):
    df = _synthetic_dataset(seed=4, n=40, FavoriteColor=lambda r: r.choice(["Red", "Blue", "Green"]))
    uploaded = _upload_validate(client, df, "blocked.csv")
    assert uploaded["validation"]["eligibility"] == {"state": "BLOCKED"}
    assert uploaded["validation"]["status"] == "blocked"
    assert any(i.get("field") == "churn" for i in uploaded["validation"]["issues"])


# ------------------------------------------------------- extra: no hard --
# contract_type requirement. Regression test for a real user report: a file
# with customer_id/tenure/churn and no contract-or-plan-length column at all
# (e-commerce-shaped data, not every vertical has this concept) was hard-
# blocked with "Contract type was not detected in this file." contract_type
# moved from MODEL_FEATURE_KEYS to OPTIONAL_FEATURE_KEYS (shared/
# churnguardFields.json's "required": false) to fix this, mirroring how
# monthly_charges was made optional earlier -- tenure alone is now the only
# unconditionally-required feature.

def test_no_hard_requirement_for_contract_type(client):
    rng = np.random.default_rng(99)
    n = 60
    df = pd.DataFrame({
        "CustomerID": [f"U{i:04d}" for i in range(n)],
        "MonthsActive": rng.integers(1, 72, size=n),
        "Churned": rng.choice(["Yes", "No"], p=[0.35, 0.65], size=n),
        "Region": rng.choice(["North", "South", "East", "West"], size=n),
    })
    uploaded = _upload_validate(client, df, "no_contract.csv")
    assert uploaded["validation"]["status"] != "blocked", uploaded["validation"]["issues"]
    assert not any(i.get("field") == "contract_type" for i in uploaded["validation"]["issues"])

    mappings = uploaded["validation"]["mapping"]["autoMappings"]
    assert "contract_type" not in mappings
    payload = {col: key for key, col in mappings.items()}
    resp = client.post(f"/api/datasets/{uploaded['id']}/map-columns", json={"mappings": payload})
    assert resp.status_code == 200, resp.text

    resp = client.post(f"/api/datasets/{uploaded['id']}/predict")
    assert resp.status_code == 200, resp.text
    assert resp.json()["customersProcessed"] == n

    customers = client.get("/api/customers?pageSize=5").json()["customers"]
    assert all(c["contractType"] is None for c in customers)


# --------------------------------------------------------------- Test 4 ---
# Same schema, churn column present, model already exists -> always
# retrains; new version saved, old version still retrievable.

def test_has_target_always_retrains_and_versions_registry(client):
    ds1, _ = _train_has_target(client, seed=5)

    canonical = schema_hash.compute_schema_hash(["tenure", "contract_type"])
    v1 = artifact_registry.get_latest(canonical)
    assert v1 is not None and v1.version == 1

    # A second, differently-seeded labeled dataset of the identical shape:
    # resolve_training_eligibility() must resolve HAS_TARGET (churn is
    # mapped), never REUSE_MODEL, even though a registry entry now exists.
    from backend.api.dataset_routes import resolve_training_eligibility
    from backend.api import store

    entry2 = store.get_dataset(_train_has_target(client, seed=6)[0])
    field_to_col = {v: k for k, v in entry2.mappings.items()}
    state, _extra = resolve_training_eligibility(entry2, field_to_col, entry2.profile, {"fields": []})
    assert state == "HAS_TARGET"

    v2 = artifact_registry.get_latest(canonical)
    assert v2.version == 2
    versions = artifact_registry.list_versions(canonical)
    assert [v.version for v in versions] == [1, 2]
    assert ds1 != entry2.id


# --------------------------------------------------------------- Test 5 ---
# Two files with same required fields but different optional fields present
# -> DIFFERENT schema hashes (see schema_hash.py's granularity decision).

def test_schema_hash_granularity_required_vs_optional():
    required_only = schema_hash.compute_schema_hash(["tenure", "contract_type"])
    with_optional = schema_hash.compute_schema_hash(["tenure", "contract_type", "monthly_charges"])
    assert required_only != with_optional, (
        "schema_hash must include optional fields: generic_predictor.preprocess() has no "
        "graceful fallback for a feature column that's entirely absent, so a coarser "
        "required-only hash could match a REUSE_MODEL candidate whose feature_columns "
        "don't structurally fit the new data."
    )
    # Field order and duplicate client_id defaults must not matter.
    assert schema_hash.compute_schema_hash(["contract_type", "tenure"]) == required_only
    # The target column must never affect the hash.
    assert schema_hash.compute_schema_hash(["tenure", "contract_type", "churn"]) == required_only


# --------------------------------------------------------------- Test 6 ---
# PSI: synthetic reference vs. shifted distribution crosses the 0.1 and 0.25
# thresholds as expected.

def test_psi_thresholds():
    rng = np.random.default_rng(42)
    reference = rng.normal(loc=50, scale=10, size=2000)

    identical = rng.normal(loc=50, scale=10, size=2000)
    assert drift.psi(reference, identical) < drift.MODERATE_DRIFT_THRESHOLD

    moderately_shifted = rng.normal(loc=54, scale=10, size=2000)
    moderate_psi = drift.psi(reference, moderately_shifted)
    assert drift.MODERATE_DRIFT_THRESHOLD <= moderate_psi < drift.HIGH_DRIFT_THRESHOLD, moderate_psi

    heavily_shifted = rng.normal(loc=90, scale=10, size=2000)
    assert drift.psi(reference, heavily_shifted) > drift.HIGH_DRIFT_THRESHOLD

    # drift_severity() must agree with the raw thresholds above.
    assert drift.drift_severity({"x": 0.05}) == "none"
    assert drift.drift_severity({"x": 0.15}) == "moderate"
    assert drift.drift_severity({"x": 0.30}) == "high"
    # The single worst feature decides, not an average.
    assert drift.drift_severity({"x": 0.01, "y": 0.30}) == "high"


# ------------------------------------------------------- extra: Step 7 ---
# CRM connectors funnel through the same register_dataframe() path as an
# upload, so Steps 1-6 apply identically regardless of source -- a static
# check, not a live CRM call.

def test_crm_connectors_share_the_upload_ingestion_path():
    import ast
    import pathlib

    connector_routes = pathlib.Path("backend/api/connector_routes.py").read_text(encoding="utf-8")
    tree = ast.parse(connector_routes)
    calls = {
        node.func.attr
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
    }
    assert "register_dataframe" in calls, (
        "connector_routes.py must ingest CRM data through ingest.register_dataframe(), "
        "the same function backend/api/dataset_routes.py's upload endpoint uses -- "
        "otherwise REUSE_MODEL/DERIVE_LABEL/drift logic would need a second, CRM-specific path."
    )


# ---------------------------------------------------- extra: identity ---
# Regression test for a real user report: a Kaggle-bank-churn-shaped file
# (CustomerId, Surname, CreditScore, Geography, Gender, Age, Tenure,
# Balance, ..., Exited) crashed with "Unknown value(s) [...] for column
# 'Surname'" during scoring -- Surname's cardinality (~25-35% unique on a
# large file) is real, but under generic/preprocessing.py's 50%-unique-ratio
# auto-drop threshold, so it slipped through as a feature; a person's name
# has no legitimate causal relationship to churn regardless of cardinality,
# so it's now filtered by name in _select_extra_columns before it ever
# reaches the trainer.

def test_identity_columns_excluded_even_at_high_cardinality(client):
    rng = np.random.default_rng(50)
    n = 400
    # Enough distinct surnames that many appear only once in a 400-row file
    # -- genuinely reproduces the "unseen value at predict time" shape, not
    # just a name-token check in isolation.
    first = ["Ava", "Noah", "Mia", "Leo", "Ivy", "Kai", "Zoe", "Finn", "Nora", "Theo"]
    last = [f"Surname{i}" for i in range(300)]
    df = pd.DataFrame({
        "CustomerId": 15000000 + np.arange(n),
        "Surname": [f"{rng.choice(first)}-{rng.choice(last)}" for _ in range(n)],
        "CreditScore": rng.integers(350, 850, size=n),
        "Geography": rng.choice(["France", "Germany", "Spain"], size=n),
        "TenureYears": rng.integers(0, 10, size=n),
        "Balance": np.round(rng.uniform(0, 200000, size=n), 2),
        "Exited": rng.choice([0, 1], p=[0.75, 0.25], size=n),
    })
    uploaded = _upload_validate(client, df, "bankchurn.csv")
    assert uploaded["validation"]["status"] != "blocked"

    mappings = uploaded["validation"]["mapping"]["autoMappings"]
    payload = {col: key for key, col in mappings.items()}
    resp = client.post(f"/api/datasets/{uploaded['id']}/map-columns", json={"mappings": payload})
    assert resp.status_code == 200, resp.text

    resp = client.post(f"/api/datasets/{uploaded['id']}/predict")
    assert resp.status_code == 200, resp.text  # this crashed with a ValueError before the fix
    body = resp.json()
    assert "Surname" not in body["extraColumnsUsed"]
    assert any(s["column"] == "Surname" for s in body["extraColumnsSkipped"])
