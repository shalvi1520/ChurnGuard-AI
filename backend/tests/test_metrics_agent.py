"""
Unit tests for generic/metrics_agent.py's pure computation: revenue-at-risk
reuse, the Reliability Score's weighting/rubric/plain-language breakdown, and
the Market Impact Explanation's churn-rate/benchmark/projection math. SHAP
faithfulness's internals (which need a real fitted CatBoost model) are
exercised indirectly by the existing /predict characterization and
generalization suites, which now also compute dataset metrics on every call
-- this file monkeypatches it out to keep these tests fast and focused on
the composition logic around it.

Run with: python -m pytest backend/tests/test_metrics_agent.py -v
"""
import pandas as pd
import pytest

from backend.api.store import DatasetEntry
from backend.api.training import TrainingResult
from backend.generic import metrics_agent


def _entry(mappings: dict, raw_features_by_id: dict = None, raw_df: pd.DataFrame = None) -> DatasetEntry:
    return DatasetEntry(
        id="ds1",
        filename="test.csv",
        size=0,
        raw_df=raw_df if raw_df is not None else pd.DataFrame(),
        profile={"rowCount": 0, "columnCount": 0},
        mappings=mappings,
        raw_features_by_id=raw_features_by_id or {},
    )


def _result(customers, **overrides) -> TrainingResult:
    defaults = dict(
        fingerprint="fp1",
        report={"feature_columns": ["tenure"], "n_rows_used": 100},
        customers=customers,
        raw_features_by_id={},
        top_drivers=[],
        cleaning=[],
        extra_columns_used=[],
        extra_columns_skipped=[],
        field_to_col={},
        training_source="trained",
        labelled_churn_count=None,
    )
    defaults.update(overrides)
    return TrainingResult(**defaults)


def _customer(cid, proba_pct, monthly=None, churned=None):
    from backend.api.dataset_routes import _risk_tier

    tier = _risk_tier(proba_pct)
    return {
        "id": cid,
        "monthlyCharges": monthly,
        "churnProbability": proba_pct,
        "riskTier": tier,
        "revenueAtRisk": round(monthly * 12 * (proba_pct / 100), 2) if monthly is not None else None,
        "churned": churned,
    }


@pytest.fixture(autouse=True)
def _stub_shap_faithfulness(monkeypatch):
    """Real SHAP faithfulness needs a fitted model on disk -- out of scope for
    a pure unit test of the composition logic. None here exercises the exact
    'component unavailable, redistribute its weight' path these tests assert."""
    monkeypatch.setattr(metrics_agent, "_shap_faithfulness", lambda entry, result: None)


def test_compute_dataset_metrics_returns_none_with_no_customers():
    entry = _entry(mappings={})
    result = _result(customers=[])
    assert metrics_agent.compute_dataset_metrics(entry, result, []) is None


# ------------------------------------------------------------- revenue ----

def test_revenue_at_risk_sums_only_high_and_critical_tiers():
    customers = [
        _customer("a", 20, monthly=100),   # low
        _customer("b", 50, monthly=100),   # medium
        _customer("c", 65, monthly=100),   # high -> 100*12*0.65 = 780
        _customer("d", 90, monthly=100),   # critical -> 100*12*0.90 = 1080
    ]
    entry = _entry(mappings={"col": "monthly_charges"})
    result = _result(customers=customers)
    metrics = metrics_agent.compute_dataset_metrics(entry, result, ["monthly_charges"])
    assert metrics["revenueAtRisk"] == pytest.approx(780 + 1080, abs=0.01)


def test_revenue_at_risk_none_without_monthly_charges():
    customers = [_customer("a", 90, monthly=None)]
    entry = _entry(mappings={})
    result = _result(customers=customers)
    metrics = metrics_agent.compute_dataset_metrics(entry, result, [])
    assert metrics["revenueAtRisk"] is None


# ------------------------------------------------------- reliability ------

@pytest.mark.parametrize(
    "row_count, mapped, all_fields, expected_label",
    [
        (2000, ["tenure", "contract_type", "monthly_charges"], ["tenure", "contract_type", "monthly_charges"], "high"),
        (20, [], ["tenure", "contract_type", "monthly_charges"], "low"),
    ],
)
def test_reliability_score_rubric_thresholds(row_count, mapped, all_fields, expected_label):
    customers = [_customer(f"c{i}", 10 if i % 2 == 0 else 90, monthly=50) for i in range(30)]
    entry = _entry(mappings={f: f for f in mapped})
    result = _result(customers=customers, report={"feature_columns": ["tenure"], "n_rows_used": row_count})
    metrics = metrics_agent.compute_dataset_metrics(entry, result, all_fields)

    assert metrics["confidenceLabel"] == expected_label
    assert metrics["lowConfidence"] == (metrics["reliabilityScore"] < 50)
    if expected_label == "high":
        assert metrics["reliabilityScore"] > 80
    else:
        assert metrics["reliabilityScore"] < 50


def test_reliability_score_redistributes_weight_when_shap_faithfulness_unavailable():
    # With the autouse stub, shapFaithfulness is always None -- confirm the
    # breakdown reflects that and the score is still a valid weighted average
    # of the four remaining components (never crashes, never defaults to 0
    # just because one signal was unavailable).
    customers = [_customer("a", 50, monthly=50)]
    entry = _entry(mappings={"m": "monthly_charges"})
    result = _result(customers=customers)
    metrics = metrics_agent.compute_dataset_metrics(entry, result, ["monthly_charges"])

    components = metrics["componentBreakdown"]["reliability"]["components"]
    assert components["shapFaithfulness"]["score"] is None
    assert components["shapFaithfulness"]["tag"] == "caution"
    assert 0 <= metrics["reliabilityScore"] <= 100


def test_drift_stability_uses_reused_model_drift_state():
    customers = [_customer("a", 50, monthly=50)]
    entry = _entry(mappings={"m": "monthly_charges"})

    stable = _result(customers=customers, reused_model={"trainedAt": "x", "driftState": "none"})
    drifted = _result(customers=customers, reused_model={"trainedAt": "x", "driftState": "high"})

    stable_score = metrics_agent.compute_dataset_metrics(entry, stable, ["monthly_charges"])["reliabilityScore"]
    drifted_score = metrics_agent.compute_dataset_metrics(entry, drifted, ["monthly_charges"])["reliabilityScore"]
    assert stable_score > drifted_score


def test_drift_stability_not_applicable_for_a_fresh_training_run():
    # No reused_model -- this is a fresh/cached training run, which has
    # nothing yet to have drifted from. The text must not fabricate a
    # "stable compared to last upload" claim that never happened.
    customers = [_customer("a", 50, monthly=50)]
    entry = _entry(mappings={"m": "monthly_charges"})
    metrics = metrics_agent.compute_dataset_metrics(entry, _result(customers=customers), ["monthly_charges"])
    drift = metrics["componentBreakdown"]["reliability"]["components"]["driftStability"]
    assert "freshly trained" in drift["text"]
    assert "last upload" not in drift["text"]


def test_reliability_narrative_is_plain_language_with_no_ml_jargon():
    customers = [_customer(f"c{i}", 10 if i % 2 == 0 else 90, monthly=50) for i in range(50)]
    entry = _entry(mappings={"tenure": "tenure", "monthly_charges": "monthly_charges"})
    metrics = metrics_agent.compute_dataset_metrics(
        entry, _result(customers=customers, report={"feature_columns": ["tenure"], "n_rows_used": 2000}),
        ["tenure", "monthly_charges"],
    )
    narrative = metrics["componentBreakdown"]["reliability"]["narrative"]
    assert f"{metrics['reliabilityScore']:.0f}/100" in narrative
    for jargon in ("SHAP", "PSI", "schema inference", "KernelExplainer", "TreeExplainer"):
        assert jargon.lower() not in narrative.lower()
    # One tagged line per component, each starting with one of the three
    # specified symbols -- no other tag vocabulary invented.
    tagged_lines = [line for line in narrative.split("\n") if line and line[0] in metrics_agent.TAG_SYMBOL.values()]
    assert len(tagged_lines) == len(metrics_agent.RELIABILITY_WEIGHTS)


# ------------------------------------------------------ market impact -----

def test_market_impact_churn_rate_and_severity():
    customers = (
        [_customer(f"a{i}", 90, monthly=100) for i in range(20)]  # critical, at risk
        + [_customer(f"b{i}", 10, monthly=100) for i in range(80)]  # low, safe
    )
    entry = _entry(mappings={"m": "monthly_charges"})
    metrics = metrics_agent.compute_dataset_metrics(entry, _result(customers=customers), ["monthly_charges"])
    mi = metrics["componentBreakdown"]["marketImpact"]

    assert mi["churnRatePct"] == 20.0
    assert mi["atRiskCount"] == 20
    assert mi["totalCustomers"] == 100
    assert mi["hasRevenueData"] is True
    assert mi["benchmarkIsGeneric"] is True  # no industry field in this fixture
    assert metrics["marketImpactSeverity"] in ("Low", "Moderate", "High", "Critical")
    assert metrics["marketImpactSeverity"] == mi["severity"]


def test_market_impact_estimates_loss_without_revenue_field_instead_of_blanking():
    # 10 at-risk customers, no monthly_charges anywhere, no industry column ->
    # generic per-customer average fallback, not a blank "Not available".
    customers = [_customer(f"c{i}", 90 if i < 10 else 10, monthly=None) for i in range(50)]
    entry = _entry(mappings={})
    metrics = metrics_agent.compute_dataset_metrics(entry, _result(customers=customers), [])
    mi = metrics["componentBreakdown"]["marketImpact"]

    assert mi["hasRevenueData"] is False
    assert mi["isEstimated"] is True
    assert mi["confidenceLevel"] == "Estimated"
    assert mi["projectedAnnualLoss"] == pytest.approx(10 * metrics_agent.GENERIC_AVG_REVENUE_PER_CUSTOMER, abs=0.01)
    assert mi["projectedAnnualLoss"] > 0
    assert metrics["marketImpactSeverity"] in ("Low", "Moderate", "High", "Critical")
    # Severity is never shown bare when the figure behind it is an estimate.
    assert mi["impactHeadline"] == f"{mi['severity']} Business Impact (Estimated)"
    assert "(Estimated)" in mi["impactHeadline"]

    explanation = metrics["marketImpactExplanation"]
    assert "$" in explanation  # a real dollar figure now appears, not a blank
    assert "estimate" in explanation.lower()
    # The card no longer asks the user to upload a column; it points at the
    # integration instead, and says so only inside the collapsed detail.
    assert "Connecting billing data gives a more precise figure." in explanation
    assert "upload a monthly or annual revenue column" not in explanation
    # Churn rate and count are still real, computed numbers.
    assert mi["churnRatePct"] == 20.0
    assert f"{mi['churnRatePct']}%" in explanation


def test_market_impact_estimate_uses_detected_industry_revenue_figure():
    customers = [_customer(f"a{i}", 90, monthly=None) for i in range(20)] + [
        _customer(f"b{i}", 10, monthly=None) for i in range(80)
    ]
    raw_df = pd.DataFrame({"Industry": ["SaaS"] * 100})
    entry = _entry(mappings={}, raw_df=raw_df)
    metrics = metrics_agent.compute_dataset_metrics(entry, _result(customers=customers), [])
    mi = metrics["componentBreakdown"]["marketImpact"]

    assert mi["benchmarkIsGeneric"] is False
    assert mi["avgRevenuePerCustomer"] == metrics_agent.INDUSTRY_AVG_REVENUE_PER_CUSTOMER["saas"]
    assert mi["projectedAnnualLoss"] == pytest.approx(20 * 1200, abs=0.01)
    assert "saas" in metrics["marketImpactExplanation"].lower()


def test_market_impact_true_dead_end_only_when_no_customers_at_all():
    entry = _entry(mappings={})
    metrics = metrics_agent.compute_dataset_metrics(entry, _result(customers=[_customer("a", 50, monthly=None)]), [])
    # A single scored customer still gets an estimate -- the true dead end is
    # reserved for zero customers, checked directly against the internal
    # function since compute_dataset_metrics() itself short-circuits on an
    # empty customer list before ever calling it.
    mi = metrics_agent._market_impact_explanation(entry, [])
    assert mi["hasRevenueData"] is False
    assert mi["isEstimated"] is False
    assert mi["projectedAnnualLoss"] is None
    assert "no financial impact can be estimated" in mi["explanation"]


def test_real_revenue_confidence_reflects_at_risk_pricing_coverage():
    # 10 at-risk, only 2 priced -> low coverage -> Low confidence, headline
    # carries the qualifier even though hasRevenueData is True.
    sparse = (
        [_customer("p1", 90, monthly=100), _customer("p2", 90, monthly=100)]
        + [_customer(f"u{i}", 90, monthly=None) for i in range(8)]
        + [_customer(f"s{i}", 10, monthly=100) for i in range(90)]
    )
    entry = _entry(mappings={"m": "monthly_charges"})
    metrics = metrics_agent.compute_dataset_metrics(entry, _result(customers=sparse), ["monthly_charges"])
    mi = metrics["componentBreakdown"]["marketImpact"]
    assert mi["hasRevenueData"] is True
    assert mi["confidenceLevel"] == "Low"
    assert "(Low)" in mi["impactHeadline"]

    # Fully priced at-risk group -> High confidence, no qualifier suffix.
    full = [_customer(f"a{i}", 90, monthly=100) for i in range(10)] + [
        _customer(f"s{i}", 10, monthly=100) for i in range(90)
    ]
    metrics_full = metrics_agent.compute_dataset_metrics(entry, _result(customers=full), ["monthly_charges"])
    mi_full = metrics_full["componentBreakdown"]["marketImpact"]
    assert mi_full["confidenceLevel"] == "High"
    assert mi_full["impactHeadline"] == f"{mi_full['severity']} Business Impact"


def test_market_impact_projected_loss_traces_to_real_customer_values():
    # 10 at-risk customers at $100/mo => $1200/yr each => $12,000 full annual
    # value at risk; the partial-year timing assumption halves that to $6,000.
    customers = [_customer(f"c{i}", 90, monthly=100) for i in range(10)] + [
        _customer(f"s{i}", 10, monthly=100) for i in range(90)
    ]
    entry = _entry(mappings={"m": "monthly_charges"})
    metrics = metrics_agent.compute_dataset_metrics(entry, _result(customers=customers), ["monthly_charges"])
    mi = metrics["componentBreakdown"]["marketImpact"]
    assert mi["projectedAnnualLoss"] == pytest.approx(6000.0, abs=0.01)
    assert "$6K" in metrics["marketImpactExplanation"]


def test_market_impact_severity_labels_span_the_benchmark_range():
    # Generic benchmark is 20-30% (midpoint 25). Well below -> Low; well
    # above -> Critical.
    low_churn = [_customer(f"a{i}", 90, monthly=50) for i in range(2)] + [
        _customer(f"b{i}", 10, monthly=50) for i in range(98)
    ]
    high_churn = [_customer(f"a{i}", 90, monthly=50) for i in range(70)] + [
        _customer(f"b{i}", 10, monthly=50) for i in range(30)
    ]
    entry = _entry(mappings={"m": "monthly_charges"})
    low_metrics = metrics_agent.compute_dataset_metrics(entry, _result(customers=low_churn), ["monthly_charges"])
    high_metrics = metrics_agent.compute_dataset_metrics(entry, _result(customers=high_churn), ["monthly_charges"])
    assert low_metrics["marketImpactSeverity"] == "Low"
    assert high_metrics["marketImpactSeverity"] == "Critical"


def test_market_impact_detects_industry_column_and_uses_its_benchmark():
    customers = [_customer(f"a{i}", 90, monthly=50) for i in range(20)] + [
        _customer(f"b{i}", 10, monthly=50) for i in range(80)
    ]
    raw_df = pd.DataFrame({"Industry": ["Banking"] * 100})
    entry = _entry(mappings={"m": "monthly_charges"}, raw_df=raw_df)
    metrics = metrics_agent.compute_dataset_metrics(entry, _result(customers=customers), ["monthly_charges"])
    mi = metrics["componentBreakdown"]["marketImpact"]
    assert mi["benchmarkIsGeneric"] is False
    assert "banking" in mi["benchmarkIndustry"].lower()


def test_market_impact_explanation_states_benchmark_is_not_live_data():
    customers = [_customer("a", 90, monthly=50)] + [_customer(f"b{i}", 10, monthly=50) for i in range(9)]
    entry = _entry(mappings={"m": "monthly_charges"})
    metrics = metrics_agent.compute_dataset_metrics(entry, _result(customers=customers), ["monthly_charges"])
    assert "not live market data" in metrics["marketImpactExplanation"]


def test_market_impact_exposes_numeric_benchmark_range_for_the_ui():
    """The card renders "typical: 20-30%" from these two numbers rather than
    picking apart benchmarkUsed, so both must be present and must agree with
    the pre-formatted string."""
    customers = [_customer("a", 90, monthly=50)] + [_customer(f"b{i}", 10, monthly=50) for i in range(9)]
    entry = _entry(mappings={"m": "monthly_charges"})
    metrics = metrics_agent.compute_dataset_metrics(entry, _result(customers=customers), ["monthly_charges"])
    mi = metrics["componentBreakdown"]["marketImpact"]

    assert isinstance(mi["benchmarkLow"], int)
    assert isinstance(mi["benchmarkHigh"], int)
    assert mi["benchmarkLow"] < mi["benchmarkHigh"]
    assert mi["benchmarkUsed"] == f"{mi['benchmarkLow']}-{mi['benchmarkHigh']}%"


def test_generic_benchmark_wording_does_not_claim_an_industry():
    """With no industry column the benchmark is the cross-industry fallback,
    so the prose must not say "for your industry" -- and must not produce the
    old "the average churn rate in a general cross-industry is around" line."""
    customers = [_customer(f"a{i}", 90, monthly=50) for i in range(30)] + [
        _customer(f"b{i}", 10, monthly=50) for i in range(70)
    ]
    entry = _entry(mappings={"m": "monthly_charges"})
    metrics = metrics_agent.compute_dataset_metrics(entry, _result(customers=customers), ["monthly_charges"])
    mi = metrics["componentBreakdown"]["marketImpact"]
    explanation = metrics["marketImpactExplanation"]

    assert mi["benchmarkIsGeneric"] is True
    assert "for your industry" not in explanation
    assert "the average churn rate in a general cross-industry" not in explanation
    assert "a typical churn rate across industries is around" in explanation
    # A ratio well above 1.05 -- the severity sentence is the one that used to
    # hard-code "for your industry", so make sure it actually ran.
    assert mi["vsBenchmarkRatio"] > 1.05
    assert "higher than typical." in explanation


def test_detected_industry_wording_still_names_the_industry():
    customers = [_customer(f"a{i}", 90, monthly=50) for i in range(30)] + [
        _customer(f"b{i}", 10, monthly=50) for i in range(70)
    ]
    raw_df = pd.DataFrame({"Industry": ["Banking"] * 100})
    entry = _entry(mappings={"m": "monthly_charges"}, raw_df=raw_df)
    metrics = metrics_agent.compute_dataset_metrics(entry, _result(customers=customers), ["monthly_charges"])
    explanation = metrics["marketImpactExplanation"]

    assert metrics["componentBreakdown"]["marketImpact"]["benchmarkIsGeneric"] is False
    assert "for your industry" in explanation
    assert "the average churn rate in banking" in explanation.lower()


def test_market_impact_explanation_has_no_double_hyphens():
    """Double hyphens are an editing artefact, not an em dash -- they should
    never reach the card, open or collapsed."""
    no_revenue = [_customer(f"c{i}", 90 if i < 10 else 10, monthly=None) for i in range(50)]
    with_revenue = [_customer(f"c{i}", 90 if i < 10 else 10, monthly=50) for i in range(50)]

    for customers, fields in ((no_revenue, []), (with_revenue, ["monthly_charges"])):
        entry = _entry(mappings={"m": "monthly_charges"} if fields else {})
        metrics = metrics_agent.compute_dataset_metrics(entry, _result(customers=customers), fields)
        assert "--" not in metrics["marketImpactExplanation"]
