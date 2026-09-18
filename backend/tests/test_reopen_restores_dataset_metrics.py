"""
Regression test for a real bug: POST /datasets/history/{id}/reopen rebuilt
the in-memory DatasetEntry from a past TrainedModel row but never restored
entry.dataset_metrics from the persisted DatasetMetrics row -- so switching
to a previously-trained dataset via History made the Reliability Score and
Market Impact sections silently disappear from /dashboard, even though they
had been correctly computed and persisted when that dataset was originally
trained. It looked like the Metrics Agent only ever worked for "one
dataset" (whichever was most recently /predict'd in this process), when in
fact every dataset had a DatasetMetrics row -- reopen just wasn't reading it
back.

Seeds DB rows directly rather than running a real training/prediction pass,
same rationale as test_dataset_history_delete.py: what reopen is responsible
for here (restoring entry.dataset_metrics) doesn't depend on a genuine model
fit. generic_artifacts.is_trained() is monkeypatched to True since reopen
checks the fitted model's artifacts exist on disk -- irrelevant to what this
test is actually checking.

Run with: python -m pytest backend/tests/test_reopen_restores_dataset_metrics.py -v
"""
import time

import pytest
from fastapi.testclient import TestClient

from backend.api import store
from backend.api.main import app
from backend.db.database import SessionLocal
from backend.db.models import Dataset as DatasetRow
from backend.db.models import DatasetMetrics, TrainedModel


def _signup(client: TestClient, label: str) -> dict:
    email = f"reopen-metrics-{label}-{int(time.time() * 1000)}@example.com"
    resp = client.post(
        "/api/auth/signup",
        json={"email": email, "password": "password123", "name": "Reopen Metrics", "acceptedTerms": True},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["user"]


_CURRENT_SHAPE_METRICS_KWARGS = dict(
    revenue_at_risk=1080.0,
    reliability_score=91.5,
    market_impact_severity="High",
    market_impact_explanation="Your churn rate is currently 50.0% (1 of 2 customers).",
    component_breakdown={
        "reliability": {"narrative": "91/100 -- High Confidence", "components": {}},
        "marketImpact": {"churnRatePct": 50.0, "severity": "High"},
    },
)

# The exact flat shape component_breakdown had before the plain-language
# rewrite added "reliability"/"marketImpact" nesting -- real rows in this
# shape exist in production from datasets processed before that change (see
# the "Reliability Score breakdown ... missing on reopen" bug this is
# regression coverage for). No market_impact_severity/explanation either:
# those columns didn't exist yet when these rows were written.
_STALE_SHAPE_METRICS_KWARGS = dict(
    revenue_at_risk=100.0,
    reliability_score=76.5,
    market_impact_severity=None,
    market_impact_explanation=None,
    component_breakdown={
        "schemaCompleteness": {"weight": 0.25, "score": 33.3},
        "sampleSizeAdequacy": {"weight": 0.2, "score": 100.0},
        "shapFaithfulness": {"weight": 0.25, "score": 88.5},
        "confidenceSpread": {"weight": 0.15, "score": 73.7},
        "driftStability": {"weight": 0.15, "score": 100.0},
    },
)


def _seed_fully_trained_dataset(user_id: str, fingerprint: str, metrics_kwargs=_CURRENT_SHAPE_METRICS_KWARGS) -> str:
    """`metrics_kwargs=None` seeds no DatasetMetrics row at all -- a dataset
    that predates the Metrics Agent entirely, never processed by it even once."""
    db = SessionLocal()
    try:
        dataset_row = DatasetRow(
            user_id=user_id, filename="seed.csv", source_kind="upload", row_count=10, column_count=3,
        )
        db.add(dataset_row)
        db.flush()

        customers = [
            {"id": "c1", "monthlyCharges": 100.0, "churnProbability": 90.0, "riskTier": "critical",
             "revenueAtRisk": 1080.0, "churned": None},
            {"id": "c2", "monthlyCharges": 50.0, "churnProbability": 10.0, "riskTier": "low",
             "revenueAtRisk": None, "churned": None},
        ]
        db.add(TrainedModel(
            dataset_id=dataset_row.id,
            fingerprint=fingerprint,
            artifact_dir="/tmp/reopen-metrics-nowhere",
            report={"test_metrics": {"accuracy": 0.9, "recall": 0.8, "roc_auc": 0.85}},
            predictions=customers,
            full_result_extra={
                "rawFeaturesById": {}, "topDrivers": [], "cleaning": [],
                "extraColumnsUsed": [], "extraColumnsSkipped": [], "contactEmailsById": {},
            },
        ))
        if metrics_kwargs is not None:
            db.add(DatasetMetrics(dataset_id=dataset_row.id, **metrics_kwargs))
        db.commit()
        return dataset_row.id
    finally:
        db.close()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _clean_store():
    store.reset()
    yield
    store.reset()


def test_reopen_restores_dataset_metrics_onto_the_dashboard(client, monkeypatch):
    from backend.api import dataset_routes

    monkeypatch.setattr(dataset_routes.generic_artifacts, "is_trained", lambda fingerprint: True)

    user = _signup(client, "restore")
    fingerprint = f"fp-reopen-metrics-{int(time.time() * 1000)}"
    dataset_id = _seed_fully_trained_dataset(user["id"], fingerprint)

    resp = client.post(f"/api/datasets/history/{dataset_id}/reopen")
    assert resp.status_code == 200, resp.text

    dashboard = client.get("/api/dashboard")
    assert dashboard.status_code == 200, dashboard.text
    body = dashboard.json()

    assert body["kpis"]["reliabilityScore"]["value"] == 91.5
    assert body["kpis"]["reliabilityScore"]["confidence"] == "high"
    assert body["kpis"]["reliabilityScore"]["breakdown"]["narrative"] == "91/100 -- High Confidence"

    assert body["marketImpact"] is not None
    assert body["marketImpact"]["severity"] == "High"
    assert body["marketImpact"]["explanation"] == "Your churn rate is currently 50.0% (1 of 2 customers)."
    assert body["marketImpact"]["churnRatePct"] == 50.0


def test_reopening_a_stale_shape_dataset_shows_the_real_score_and_a_reprocess_note(client, monkeypatch):
    """Root cause of the reported bug: not a missing row, not a cache-hit
    code path skipping dataset_metrics (both already work, see the test
    above) -- a *persisted* row from before the plain-language rewrite,
    whose component_breakdown is still the old flat shape. The real
    reliability_score must still show (it's genuinely there); the
    breakdown/market-impact sections that don't exist in that shape must be
    marked unavailable, not silently empty."""
    from backend.api import dataset_routes

    monkeypatch.setattr(dataset_routes.generic_artifacts, "is_trained", lambda fingerprint: True)

    user = _signup(client, "stale")
    fingerprint = f"fp-reopen-stale-{int(time.time() * 1000)}"
    dataset_id = _seed_fully_trained_dataset(user["id"], fingerprint, metrics_kwargs=_STALE_SHAPE_METRICS_KWARGS)

    resp = client.post(f"/api/datasets/history/{dataset_id}/reopen")
    assert resp.status_code == 200, resp.text

    body = client.get("/api/dashboard").json()

    # The real, persisted score is shown -- not hidden behind a generic
    # "unavailable" banner just because the newer sub-fields are missing.
    assert body["kpis"]["reliabilityScore"]["value"] == 76.5
    assert "unavailable" not in body["kpis"]["reliabilityScore"]
    assert body["kpis"]["reliabilityScore"]["breakdown"] is None

    # Market Impact has no equivalent partial state (severity/explanation
    # didn't exist yet either) -- explicitly flagged, not a bare None that
    # would make the whole section silently vanish.
    assert body["marketImpact"] == {"unavailable": True}


def test_reopening_a_dataset_that_predates_the_metrics_agent_entirely_degrades_gracefully(client, monkeypatch):
    """No DatasetMetrics row was ever created for this dataset -- older than
    the feature itself, not just an older shape of it. Both sections must
    say so plainly rather than one showing a bare headline and the other
    disappearing without explanation."""
    from backend.api import dataset_routes

    monkeypatch.setattr(dataset_routes.generic_artifacts, "is_trained", lambda fingerprint: True)

    user = _signup(client, "no-row")
    fingerprint = f"fp-reopen-no-row-{int(time.time() * 1000)}"
    dataset_id = _seed_fully_trained_dataset(user["id"], fingerprint, metrics_kwargs=None)

    resp = client.post(f"/api/datasets/history/{dataset_id}/reopen")
    assert resp.status_code == 200, resp.text

    body = client.get("/api/dashboard").json()
    assert body["kpis"]["reliabilityScore"] == {"unavailable": True}
    assert body["marketImpact"] == {"unavailable": True}
