"""
GET /api/customers's segment filters -- the drill-downs Portfolio & Risk's
"Where risk concentrates" chart links into.

The property worth testing is agreement, not just that a parameter is accepted:
a bar on the chart and the list it opens must describe the same accounts, so
these assert the filtered totals against /api/dashboard/segmentation's own
counts rather than against hardcoded numbers.

Run with: python -m pytest backend/tests/test_customer_filters.py -v
"""
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.generic import artifact_registry

CONTRACTS = ["Month-to-month", "One year", "Two year"]
TIERS = ["Basic", "Premium"]


def _dataset() -> pd.DataFrame:
    """A labelled dataset with both a contract column and a service tier, so
    both segment filters have something real to match on. Month-to-month churns
    far more often, so the segments aren't uniform."""
    rng = np.random.default_rng(7)
    rows = []
    for i in range(60):
        contract = CONTRACTS[i % 3]
        churned = rng.random() < (0.55 if contract == "Month-to-month" else 0.15)
        rows.append({
            "CustID": f"C-{i:04d}",
            "MonthsActive": int(rng.integers(1, 72)),
            "Contract": contract,
            "Package": TIERS[i % 2],
            "Churned": "Yes" if churned else "No",
        })
    return pd.DataFrame(rows)


@pytest.fixture(scope="module")
def trained_client(tmp_path_factory):
    """Trains once for the whole module -- every test here only reads the
    result back through different filters. The registry is redirected to a temp
    directory so a run never depends on, or leaves behind, real artifacts."""
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(artifact_registry, "REGISTRY_DIR", str(tmp_path_factory.mktemp("registry")))
        client = TestClient(app)

        df = _dataset()
        resp = client.post(
            "/api/datasets/upload",
            files={"file": ("segments.csv", df.to_csv(index=False).encode(), "text/csv")},
        )
        assert resp.status_code == 200, resp.text
        dataset_id = resp.json()["id"]

        validation = client.post(f"/api/datasets/{dataset_id}/validate").json()
        mappings = validation["mapping"]["autoMappings"]
        assert {"customer_id", "tenure", "contract_type", "service_tier", "churn"} <= set(mappings), mappings

        resp = client.post(
            f"/api/datasets/{dataset_id}/map-columns",
            json={"mappings": {col: key for key, col in mappings.items()}},
        )
        assert resp.status_code == 200, resp.text
        resp = client.post(f"/api/datasets/{dataset_id}/predict")
        assert resp.status_code == 200, resp.text
        yield client


def _segment(client, group: str, name: str) -> dict:
    segments = client.get("/api/dashboard/segmentation").json()[group]
    return next(s for s in segments if s["segment"] == name)


def _customers(client, **params) -> dict:
    # limit=0 means "no pagination" to list_customers, so totals and rows can
    # be compared without paging through.
    return client.get("/api/customers", params={"limit": 0, **params}).json()


def test_contract_filter_lists_exactly_the_segment_it_came_from(trained_client):
    segment = _segment(trained_client, "byPlan", "Month-to-month")

    listed = _customers(trained_client, contract="Month-to-month")

    assert listed["total"] == segment["total"]
    assert all(c["contractType"] == "Month-to-month" for c in listed["customers"])


def test_at_risk_within_a_contract_combines_both_filters(trained_client):
    """The orange bar: this segment's at-risk accounts, not the whole segment."""
    segment = _segment(trained_client, "byPlan", "Month-to-month")

    listed = _customers(trained_client, contract="Month-to-month", status="at-risk")

    assert listed["total"] == segment["atRisk"]
    assert all(c["contractType"] == "Month-to-month" for c in listed["customers"])
    assert all(c["riskTier"] in ("high", "critical") for c in listed["customers"])


def test_service_tier_filter_matches_its_segment(trained_client):
    tiers = trained_client.get("/api/dashboard/segmentation").json()["byServiceTier"]
    assert tiers, "fixture dataset must produce service-tier segments"
    tier = tiers[0]

    listed = _customers(trained_client, serviceTier=tier["segment"])

    assert listed["total"] == tier["total"]
    assert all(c["serviceTier"] == tier["segment"] for c in listed["customers"])


def test_risk_tier_filter_matches_the_distribution_chart(trained_client):
    distribution = trained_client.get("/api/dashboard/risk-distribution").json()
    counts = {row["name"].split(" ")[0].lower(): row["value"] for row in distribution}

    for tier, expected in counts.items():
        listed = _customers(trained_client, risk=tier)
        assert listed["total"] == expected, tier
        assert all(c["riskTier"] == tier for c in listed["customers"])


def test_unknown_segment_lists_nothing_rather_than_everything(trained_client):
    """A stale or hand-edited link must not silently fall back to every account."""
    listed = _customers(trained_client, contract="Quarterly")

    assert listed["total"] == 0
    assert listed["customers"] == []


def test_segment_parameters_are_optional(trained_client):
    """Regression guard: adding them didn't change the default listing."""
    total = trained_client.get("/api/dashboard").json()["kpis"]["totalCustomers"]["value"]

    assert _customers(trained_client)["total"] == total
