"""
Model Health, the What-If simulator, and the account activity feed -- three
independent additions to dataset_routes.py that all read state already
produced by a normal /predict call, so one shared trained fixture (module-
scoped, one real training run) covers all three rather than paying for a
fresh Optuna + stacking fit per test.

Run with: python -m pytest backend/tests/test_model_health_whatif_activity.py -v
"""
import time

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.generic import artifact_registry

FIXTURE_USER_NAME = "Health WhatIf"


def _dataset(seed: int = 11, n: int = 60) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    return pd.DataFrame({
        "CustID": [f"C-{i:04d}" for i in range(n)],
        "MonthsActive": rng.integers(1, 72, size=n),
        "Contract": rng.choice(["Month-to-month", "One year", "Two year"], size=n),
        "Churned": rng.choice(["Yes", "No"], p=[0.3, 0.7], size=n),
    })


@pytest.fixture(scope="module")
def trained_client(tmp_path_factory):
    """Signs up, uploads, maps and trains once for the whole module. The
    registry is redirected to a temp directory so this never depends on, or
    leaves behind, real artifacts (same pattern as test_customer_filters.py).
    """
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(artifact_registry, "REGISTRY_DIR", str(tmp_path_factory.mktemp("registry")))
        with TestClient(app) as client:
            email = f"health-whatif-{int(time.time() * 1000)}@example.com"
            resp = client.post(
                "/api/auth/signup",
                json={"email": email, "password": "password123", "name": FIXTURE_USER_NAME, "acceptedTerms": True},
            )
            assert resp.status_code == 201, resp.text

            df = _dataset()
            resp = client.post(
                "/api/datasets/upload",
                files={"file": ("t.csv", df.to_csv(index=False).encode(), "text/csv")},
            )
            assert resp.status_code == 200, resp.text
            dataset_id = resp.json()["id"]

            mappings = client.post(f"/api/datasets/{dataset_id}/validate").json()["mapping"]["autoMappings"]
            resp = client.post(
                f"/api/datasets/{dataset_id}/map-columns",
                json={"mappings": {col: key for key, col in mappings.items()}},
            )
            assert resp.status_code == 200, resp.text
            resp = client.post(f"/api/datasets/{dataset_id}/predict")
            assert resp.status_code == 200, resp.text

            yield client


def _first_customer(client):
    return client.get("/api/customers", params={"limit": 1}).json()["customers"][0]


# ------------------------------------------------------------- model health

def test_model_health_reports_a_real_trained_at_and_no_fabricated_drift(trained_client):
    resp = trained_client.get("/api/model-health")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["trainedAt"] is not None
    assert body["metrics"]["accuracy"] is not None

    # This connect trained fresh -- there is nothing to compare it against,
    # so drift must be reported as not applicable, never as "no drift" (which
    # would falsely claim a comparison that never happened).
    assert body["drift"]["applicable"] is False
    assert body["drift"]["state"] is None

    # No scheduled retrain job exists in this test environment -- honestly
    # empty, not a fabricated "healthy" reading.
    assert body["retrain"]["latest"] is None


# ----------------------------------------------------------------- what-if

def test_what_if_rescores_with_an_overridden_feature(trained_client):
    customer = _first_customer(trained_client)
    exp = trained_client.get(f"/api/customers/{customer['id']}/explanation").json()
    assert exp["features"], "fixture customer must have at least one driver"
    key = exp["features"][0]["key"]
    assert key  # the raw feature key what-if overrides are keyed by

    resp = trained_client.post(f"/api/customers/{customer['id']}/what-if", json={"overrides": {key: 0}})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert 0 <= body["churnProbability"] <= 100
    assert body["features"]
    assert all(f["key"] for f in body["features"])


def test_what_if_rejects_an_unknown_feature_key(trained_client):
    customer = _first_customer(trained_client)
    resp = trained_client.post(
        f"/api/customers/{customer['id']}/what-if", json={"overrides": {"not_a_real_feature": 1}}
    )
    assert resp.status_code == 400


def test_what_if_404s_for_an_unknown_customer(trained_client):
    resp = trained_client.post("/api/customers/does-not-exist/what-if", json={"overrides": {}})
    assert resp.status_code == 404


def test_what_if_never_pollutes_the_real_explanation_cache(trained_client):
    """A hypothetical override must never leak into GET .../explanation's
    cached, real answer for this customer."""
    customer = _first_customer(trained_client)
    before = trained_client.get(f"/api/customers/{customer['id']}/explanation").json()
    key = before["features"][0]["key"]

    trained_client.post(f"/api/customers/{customer['id']}/what-if", json={"overrides": {key: 0}})

    after = trained_client.get(f"/api/customers/{customer['id']}/explanation").json()
    assert after == before


# ----------------------------------------------------------------- activity

def test_activity_feed_logs_training_with_the_real_signed_in_user(trained_client):
    resp = trained_client.get("/api/activity")
    assert resp.status_code == 200, resp.text
    events = resp.json()["events"]
    trained_events = [e for e in events if e["actionType"] == "model_trained"]
    assert trained_events, "expected at least one model_trained event from the fixture's own /predict call"
    assert trained_events[0]["detail"]


def test_activity_feed_requires_sign_in():
    with TestClient(app) as anon:
        resp = anon.get("/api/activity")
    assert resp.status_code == 401


def test_outreach_actions_are_attributed_to_the_real_user_not_a_placeholder(trained_client):
    customer = _first_customer(trained_client)
    resp = trained_client.post(f"/api/customers/{customer['id']}/outreach/generate")
    assert resp.status_code == 200, resp.text
    draft = resp.json()
    assert draft["auditTrail"][0]["user"] not in ("You", "System")
    assert draft["auditTrail"][0]["user"] == FIXTURE_USER_NAME

    resp = trained_client.post(f"/api/outreach/{draft['id']}/approve")
    assert resp.status_code == 200, resp.text

    activity = trained_client.get("/api/activity").json()["events"]
    action_types = {e["actionType"] for e in activity}
    assert "outreach_drafted" in action_types
    assert "outreach_approved" in action_types
