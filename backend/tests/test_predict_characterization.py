"""
Characterization tests for POST /predict -- written BEFORE extracting
train_and_score() out of run_prediction(), and deliberately asserting
current behaviour rather than desired behaviour.

run_prediction() has four exit paths. Two of them (the full-result cache
hit and the training-only cache hit) had no automated coverage at all
before this file, and they are the most intricate branches in the function:
they decide what gets recomputed, what gets restored from the database, and
-- critically -- whether auto-outreach gets re-queued. Refactoring them
without a safety net is how a silent regression ends up shipping as a stale
dashboard.

Each path's full /predict response is written to fixtures/ so the
post-extraction output can be compared byte for byte.

These are slow: every path needs at least one genuine Optuna + stacking fit.
"""
import json
import os
import time
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.db.database import SessionLocal
from backend.db.models import Dataset as DatasetRow
from backend.db.models import TrainedModel
from backend.generic import artifact_registry

FIXTURE_DIR = Path(__file__).parent / "fixtures"

# Response keys whose values legitimately differ run to run (a new dataset id
# per upload). Everything else must match byte for byte across the
# extraction, so these are blanked before saving/comparing rather than
# excluded -- their presence is still part of the contract.
VOLATILE_KEYS = ("datasetId",)

# Nested values that also change run to run: the REUSE_MODEL path reports
# when the reused model was trained, and the registry entry is rebuilt on
# every run. `driftState` alongside it is NOT volatile and stays compared.
VOLATILE_NESTED = {"reusedModel": ("trainedAt",)}


def _stable(payload: dict) -> dict:
    out = {**payload, **{k: "<volatile>" for k in VOLATILE_KEYS if k in payload}}
    for parent, children in VOLATILE_NESTED.items():
        if isinstance(out.get(parent), dict):
            out[parent] = {
                **out[parent],
                **{c: "<volatile>" for c in children if c in out[parent]},
            }
    return out


def save_fixture(name: str, payload: dict) -> None:
    """Writes a fixture only if it does not already exist.

    Write-once on purpose. An earlier version overwrote on every run, which
    made the comparison below circular -- it compared freshly-captured output
    against a file written from that same output moments earlier, and so
    could never fail. A baseline that regenerates itself is not a baseline.

    Delete the file deliberately to re-record one.
    """
    FIXTURE_DIR.mkdir(exist_ok=True)
    path = FIXTURE_DIR / f"{name}.json"
    if path.exists():
        return
    path.write_text(json.dumps(_stable(payload), indent=2, sort_keys=True), encoding="utf-8")


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURE_DIR / f"{name}.json").read_text(encoding="utf-8"))


def _labelled_frame(seed: int, n: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    return pd.DataFrame({
        "CustID": [f"P{seed}-{i:04d}" for i in range(n)],
        "MonthsActive": rng.integers(1, 72, size=n),
        "Contract": rng.choice(["Month-to-month", "One year", "Two year"], size=n),
        "Churned": rng.choice(["Yes", "No"], p=[0.35, 0.65], size=n),
    })


def _reuse_slice_of(frame: pd.DataFrame, n: int) -> pd.DataFrame:
    """An unlabelled frame drawn from the same population as `frame`.

    Sampling rows out of the training frame itself (rather than generating a
    fresh one) keeps the feature distribution genuinely comparable, which is
    what a REUSE_MODEL test needs: the subject is "does a matching model get
    reused", not "does the drift gate fire". Customer ids are made distinct
    so this reads as different accounts of the same shape.
    """
    sampled = frame.sample(n=n, random_state=7).drop(columns=["Churned"]).reset_index(drop=True)
    sampled["CustID"] = [f"R-{i:04d}" for i in range(len(sampled))]
    return sampled


def _connect_and_map(client, df: pd.DataFrame, name: str, headers=None) -> str:
    resp = client.post(
        "/api/datasets/upload",
        files={"file": (name, df.to_csv(index=False).encode(), "text/csv")},
    )
    assert resp.status_code == 200, resp.text
    dataset_id = resp.json()["id"]

    validation = client.post(f"/api/datasets/{dataset_id}/validate").json()
    mappings = validation["mapping"]["autoMappings"]
    payload = {col: key for key, col in mappings.items()}
    resp = client.post(f"/api/datasets/{dataset_id}/map-columns", json={"mappings": payload})
    assert resp.status_code == 200, resp.text
    return dataset_id


def _clear_full_result_cache(user_id: str, fingerprint: str) -> int:
    """Blanks predictions/full_result_extra on the stored model, leaving the
    training row and its on-disk artifacts intact -- which is precisely the
    state that makes _load_cached_full_result() miss while
    _load_cached_training() still hits. Exactly the shape of the rows that
    predate those two columns existing."""
    db = SessionLocal()
    try:
        rows = (
            db.query(TrainedModel)
            .join(DatasetRow, TrainedModel.dataset_id == DatasetRow.id)
            .filter(DatasetRow.user_id == user_id, TrainedModel.fingerprint == fingerprint)
            .all()
        )
        for row in rows:
            row.predictions = None
            row.full_result_extra = None
        db.commit()
        return len(rows)
    finally:
        db.close()


@pytest.fixture(scope="module")
def captures(tmp_path_factory):
    """Walks all four exit paths once and captures each response.

    Module-scoped on purpose: every path needs a real training run, and
    repeating those per-test would put this file into the tens of minutes.
    Sets REGISTRY_DIR directly rather than via monkeypatch (which is
    function-scoped and cannot be used from a module-scoped fixture).
    """
    original_registry = artifact_registry.REGISTRY_DIR
    artifact_registry.REGISTRY_DIR = str(tmp_path_factory.mktemp("registry"))
    client = TestClient(app)
    out = {}

    try:
        email = f"charact{int(time.time())}@example.com"
        resp = client.post(
            "/api/auth/signup",
            json={"email": email, "password": "password123", "name": "Characterization"},
        )
        assert resp.status_code == 200, resp.text
        token = resp.json()["token"]
        user_id = resp.json()["user"]["id"]
        headers = {"Authorization": f"Bearer {token}"}

        frame = _labelled_frame(seed=101, n=60)

        # --- 1. fresh train -------------------------------------------------
        ds1 = _connect_and_map(client, frame, "fresh.csv")
        resp = client.post(f"/api/datasets/{ds1}/predict", headers=headers)
        assert resp.status_code == 200, resp.text
        out["fresh_train"] = resp.json()

        # --- 2. full-result cache hit (identical data, same account) --------
        ds2 = _connect_and_map(client, frame, "cached_full.csv")
        resp = client.post(f"/api/datasets/{ds2}/predict", headers=headers)
        assert resp.status_code == 200, resp.text
        out["cache_full"] = resp.json()

        # --- 3. training-only cache hit -------------------------------------
        fingerprint_rows = _clear_full_result_cache(user_id, _fingerprint_of(client, ds2))
        assert fingerprint_rows >= 1, "expected a stored TrainedModel row to blank"
        ds3 = _connect_and_map(client, frame, "cached_training_only.csv")
        resp = client.post(f"/api/datasets/{ds3}/predict", headers=headers)
        assert resp.status_code == 200, resp.text
        out["cache_training_only"] = resp.json()

        # --- 4. REUSE_MODEL --------------------------------------------------
        # Same canonical shape as the labelled frame, but with no churn
        # column at all, so resolve_training_eligibility() finds the model
        # just registered for this schema and scores against it.
        #
        # Sliced from the SAME draw as the training frame rather than drawn
        # independently. Two independent draws of the same distribution
        # measure as PSI > 1.0 at these row counts (~4-6 rows per bin over
        # 10 bins), so the drift gate correctly declines the reuse and the
        # path under test never executes. That is small-sample PSI noise,
        # not drift -- see test_high_drift_declines_reuse_and_falls_back for
        # the case where high drift is the genuine subject of the test.
        unlabelled = _reuse_slice_of(frame, n=40)
        ds4 = _connect_and_map(client, unlabelled, "reuse.csv")
        resp = client.post(f"/api/datasets/{ds4}/predict", headers=headers)
        assert resp.status_code == 200, resp.text
        out["reuse_model"] = resp.json()

        for name, payload in out.items():
            save_fixture(name, payload)

        yield out
    finally:
        artifact_registry.REGISTRY_DIR = original_registry


def _fingerprint_of(client, dataset_id: str) -> str:
    """The in-memory entry knows its fingerprint once /predict has run."""
    from backend.api import store

    entry = store.get_dataset(dataset_id)
    assert entry is not None and entry.fingerprint, "entry has no fingerprint yet"
    return entry.fingerprint


# ------------------------------------------------------------------ paths --

def test_fresh_train_path(captures):
    body = captures["fresh_train"]
    assert body["trainingSource"] == "trained"
    assert body["status"] == "completed"
    assert body["customersProcessed"] == 60
    assert isinstance(body["labelledChurnCount"], int) and body["labelledChurnCount"] > 0
    assert body["autoOutreach"]["state"] in {"running", "done"}


def test_full_result_cache_hit(captures):
    body = captures["cache_full"]
    assert body["trainingSource"] == "cached"
    assert body["customersProcessed"] == captures["fresh_train"]["customersProcessed"]
    assert body["labelledChurnCount"] == captures["fresh_train"]["labelledChurnCount"]
    # Scores must come back identical to the run they were cached from --
    # a cache that returns different numbers is worse than no cache.
    assert body["trainingMetrics"] == captures["fresh_train"]["trainingMetrics"]
    assert body["cleaning"] == captures["fresh_train"]["cleaning"]


def test_full_result_cache_hit_does_not_requeue_outreach(captures):
    """The guard at dataset_routes.py's full-result branch: a cache hit must
    NOT re-queue _run_auto_outreach, because that loop recomputes a fresh
    SHAP explanation per high-risk customer -- the single most expensive step
    a cache hit exists to avoid. Restored drafts are reported as `queued`,
    never as `total` work still to do."""
    auto = captures["cache_full"]["autoOutreach"]
    assert auto["state"] == "done", auto
    assert auto["total"] == 0, auto
    assert auto["done"] == 0, auto


def test_training_only_cache_hit(captures):
    body = captures["cache_training_only"]
    # Still reported as 'cached' -- the Optuna/stacking fit was skipped --
    # even though inference and SHAP genuinely re-ran on this path.
    assert body["trainingSource"] == "cached"
    assert body["customersProcessed"] == captures["fresh_train"]["customersProcessed"]
    assert body["labelledChurnCount"] == captures["fresh_train"]["labelledChurnCount"]
    assert body["trainingMetrics"] == captures["fresh_train"]["trainingMetrics"]


def test_reuse_model_path(captures):
    body = captures["reuse_model"]
    assert body["trainingSource"] == "reused"
    assert body["labelledChurnCount"] is None
    assert body["customersProcessed"] == 40
    assert body["reusedModel"]["driftState"] in {"none", "moderate"}


def test_all_four_fixtures_written(captures):
    for name in ("fresh_train", "cache_full", "cache_training_only", "reuse_model"):
        assert (FIXTURE_DIR / f"{name}.json").exists(), f"missing fixture for {name}"
        assert load_fixture(name) == _stable(captures[name])


# ------------------------------------------------- DB failure behaviour --

def test_db_failure_mid_persist_does_not_fail_the_request(monkeypatch, tmp_path):
    """Documents TODAY's behaviour, deliberately without changing it.

    Every persistence helper (_persist_training, _persist_predictions) wraps
    its work in try/except-log-rollback, so losing the database mid-training
    degrades to "the run succeeds, nothing is cached". Worth pinning down
    before the extraction: it is easy to accidentally convert this into a
    500 by letting a persistence error escape the new pure function.

    Relevant beyond tests -- Neon dropped a connection mid-transaction
    during the migration work, so this is an observed failure mode, not a
    hypothetical one.
    """
    original_registry = artifact_registry.REGISTRY_DIR
    artifact_registry.REGISTRY_DIR = str(tmp_path / "registry")
    client = TestClient(app)
    try:
        email = f"dbfail{int(time.time())}@example.com"
        resp = client.post(
            "/api/auth/signup",
            json={"email": email, "password": "password123", "name": "DB Fail"},
        )
        assert resp.status_code == 200, resp.text
        headers = {"Authorization": f"Bearer {resp.json()['token']}"}

        dataset_id = _connect_and_map(client, _labelled_frame(seed=303, n=45), "dbfail.csv")

        # Signing in worked (real session), but every persistence attempt
        # from here on hits a dead connection.
        from backend.api import dataset_routes

        monkeypatch.setattr(dataset_routes, "SessionLocal", lambda: _DeadSession())

        resp = client.post(f"/api/datasets/{dataset_id}/predict", headers=headers)

        # The documented baseline: the request still succeeds, and reports a
        # genuine fresh training run.
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["trainingSource"] == "trained"
        assert body["customersProcessed"] == 45
        assert body["status"] == "completed"
    finally:
        artifact_registry.REGISTRY_DIR = original_registry


class OperationalErrorStub(Exception):
    """Stands in for a dropped connection without needing a live one."""


class _DeadSession:
    """A session whose connection has dropped.

    Query/commit operations raise; close() is a no-op. That asymmetry is the
    realistic part: SQLAlchemy's Session.close() returns the connection to
    the pool and handles an already-invalidated one without raising, so a
    stub that raises on close() too (as an earlier version of this test did)
    describes a scenario that cannot occur -- and passing it proves nothing.
    See _ClosingFailsSession for the case where close() itself raises.
    """

    def close(self):
        return None

    def rollback(self):
        return None

    def __getattr__(self, _name):
        raise OperationalErrorStub("connection to server was lost")


class _ClosingFailsSession(_DeadSession):
    """The narrower case: everything fails, including close().

    Rare in practice, but it is the one shape that used to escape the
    except-and-degrade handlers entirely, because `finally: db.close()` sat
    outside them -- converting a best-effort cache miss into a 500. Guarded
    now by dataset_routes._safe_close().
    """

    def close(self):
        raise OperationalErrorStub("connection already invalidated; close failed")


def test_failing_session_close_does_not_escape_as_500(monkeypatch, tmp_path):
    """Regression test for the `finally: db.close()` fragility.

    Before _safe_close(), an exception raised by close() propagated past the
    `except Exception: return None` that exists specifically to guarantee a
    database problem can never break /predict -- so this request returned a
    500. It must now degrade to "nothing was cached" and still succeed.
    """
    original_registry = artifact_registry.REGISTRY_DIR
    artifact_registry.REGISTRY_DIR = str(tmp_path / "registry")
    client = TestClient(app)
    try:
        email = f"closefail{int(time.time())}@example.com"
        resp = client.post(
            "/api/auth/signup",
            json={"email": email, "password": "password123", "name": "Close Fail"},
        )
        assert resp.status_code == 200, resp.text
        headers = {"Authorization": f"Bearer {resp.json()['token']}"}

        dataset_id = _connect_and_map(client, _labelled_frame(seed=404, n=45), "closefail.csv")

        from backend.api import dataset_routes

        monkeypatch.setattr(dataset_routes, "SessionLocal", lambda: _ClosingFailsSession())

        resp = client.post(f"/api/datasets/{dataset_id}/predict", headers=headers)

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["trainingSource"] == "trained"
        assert body["customersProcessed"] == 45
    finally:
        artifact_registry.REGISTRY_DIR = original_registry
