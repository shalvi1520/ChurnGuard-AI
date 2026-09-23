"""
The Metrics Agent: computes the numbers and the plain-English explanations
shown on the dashboard for the dataset just trained/scored -- revenue at
risk, a Reliability Score with a business-readable breakdown, and a Market
Impact Explanation (churn rate, projected revenue loss, and an industry
benchmark comparison). Runs once per /predict, after scoring+explanation
(dataset_routes.py's train_and_score()) has produced a TrainingResult and
before the conditional auto-outreach step is queued -- the same position
"after Explain, before Outreach" occupies in a graph-based pipeline, just
expressed as a plain function call in this codebase's actual (non-LangGraph)
per-dataset flow.

Both outputs are written for a non-technical reader: no SHAP/PSI/schema-
inference jargon reaches the returned text, only what those signals mean in
plain business terms. Every number quoted in the generated text is computed
from this run's actual data -- nothing here is a placeholder or a per-
dataset hardcoded string.

Pure and best-effort throughout, same philosophy as drift.py and every
persistence helper in dataset_routes.py: a failure in one optional signal
(most likely SHAP faithfulness, which reloads model artifacts) must never
break /predict.  No DB access here -- dataset_routes.py owns persistence
and reconstructs this same shape from a DatasetMetrics row when a dataset
is reopened from history rather than freshly trained (see
confidence_label_for(), used by both).
"""
import math
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import shap

from . import artifacts, config, predictor as generic_predictor
from .explainer import explain_high_risk_batch

# Sample-size adequacy saturates at roughly this multiple of MIN_ROWS_REQUIRED
# (config.MIN_ROWS_REQUIRED=20 -> ~1000 rows reads as a fully adequate sample).
# Below the minimum never reaches this function -- the trainer itself rejects it.
SAMPLE_SIZE_TARGET_MULTIPLE = 50

# How many customers' raw features to draw for the SHAP faithfulness check.
# Kept small: KernelExplainer's cost scales with sample size, and this only
# needs enough rows for a stable correlation, not a precise estimate.
FAITHFULNESS_SAMPLE_SIZE = 30

RELIABILITY_WEIGHTS = {
    "schemaCompleteness": 0.25,
    "sampleSizeAdequacy": 0.20,
    "shapFaithfulness": 0.25,
    "confidenceSpread": 0.15,
    "driftStability": 0.15,
}

_DRIFT_STATE_SCORES = {"none": 100.0, "moderate": 60.0, "high": 20.0}

GOOD_THRESHOLD = 80
CAUTION_THRESHOLD = 50
TAG_SYMBOL = {"good": "✓", "caution": "⚠", "poor": "✗"}  # check, warning, cross


def confidence_label_for(score: Optional[float]) -> Tuple[str, bool]:
    """The same >80/50-80/<50 rubric used everywhere a reliability score is
    shown -- factored out so a dataset reopened from history (which reads a
    persisted score back out of the database, not a freshly computed one)
    reports the identical label a fresh run would, rather than storing (and
    risking drifting from) a second copy of this rule."""
    if score is None:
        return "low", True
    if score > GOOD_THRESHOLD:
        return "high", False
    if score >= CAUTION_THRESHOLD:
        return "moderate", False
    return "low", True


def _tag_for_score(score: Optional[float]) -> str:
    """None (a signal that couldn't be computed this run) is flagged, not
    silently treated as good -- a reader should know it wasn't verified."""
    if score is None:
        return "caution"
    if score >= GOOD_THRESHOLD:
        return "good"
    if score >= CAUTION_THRESHOLD:
        return "caution"
    return "poor"


def _pretty_field(field_key: str) -> str:
    words = field_key.replace("_", " ")
    return words[:1].upper() + words[1:]


def _revenue_at_risk(customers: List[Dict[str, Any]]) -> Optional[float]:
    """Sum of the already-computed per-customer revenueAtRisk for high/critical
    tiers -- the exact same figure get_dashboard() reports (dataset_routes.py),
    reusing its computed output rather than the formula itself."""
    if not any("monthlyCharges" in c and c["monthlyCharges"] is not None for c in customers):
        return None
    at_risk = [c for c in customers if c["riskTier"] in ("high", "critical")]
    return round(sum(c["revenueAtRisk"] or 0 for c in at_risk), 2)


# ============================================================ Reliability ==

def _schema_completeness(mapped_fields: List[str], all_recognized_fields: List[str]) -> Dict[str, Any]:
    if not all_recognized_fields:
        return {"pct": 100.0, "present": [], "missing": [], "total": 0}
    present = [f for f in all_recognized_fields if f in mapped_fields]
    missing = [f for f in all_recognized_fields if f not in mapped_fields]
    pct = round((len(present) / len(all_recognized_fields)) * 100, 1)
    return {"pct": pct, "present": present, "missing": missing, "total": len(all_recognized_fields)}


def _schema_completeness_text(tag: str, info: Dict[str, Any]) -> str:
    pct = info["pct"]
    if tag == "good":
        return f"Your data had almost all the information the model could use ({pct:.0f}% of the relevant fields were provided)."
    missing_labels = ", ".join(_pretty_field(f) for f in info["missing"][:3])
    if tag == "caution":
        return (
            f"Your data was missing some fields the model could have used ({pct:.0f}% complete, "
            f"missing e.g. {missing_labels}) -- predictions are still usable but less precise."
        )
    return (
        f"Your data was missing a lot of the information the model could use ({pct:.0f}% complete, "
        f"missing e.g. {missing_labels}) -- treat predictions with extra caution and consider adding these fields."
    )


def _sample_size_adequacy(row_count: int) -> float:
    if row_count <= 0:
        return 0.0
    ratio = row_count / config.MIN_ROWS_REQUIRED
    score = 100 * math.log(1 + ratio) / math.log(1 + SAMPLE_SIZE_TARGET_MULTIPLE)
    return round(min(100.0, max(0.0, score)), 1)


def _sample_size_text(tag: str, row_count: int) -> str:
    rows = f"{row_count:,}"
    if tag == "good":
        return f"You uploaded enough customers for the model to learn reliable patterns ({rows} rows)."
    if tag == "caution":
        return f"You uploaded a workable but modest number of customers ({rows} rows) -- more data would sharpen the model's patterns."
    return f"You uploaded relatively few customers ({rows} rows) -- the model has limited data to learn reliable patterns from."


def _confidence_spread(customers: List[Dict[str, Any]]) -> float:
    if not customers:
        return 0.0
    spreads = [abs(c["churnProbability"] / 100 - 0.5) * 2 for c in customers]
    return round((sum(spreads) / len(spreads)) * 100, 1)


def _confidence_spread_text(tag: str, customers: List[Dict[str, Any]]) -> str:
    borderline = sum(1 for c in customers if 40 <= c["churnProbability"] <= 60)
    pct_borderline = round((borderline / len(customers)) * 100, 1) if customers else 0.0
    if tag == "good":
        return f"The model confidently separates your customers -- only {pct_borderline:.0f}% land in a borderline, coin-flip risk range."
    if tag == "caution":
        return (
            f"Some predictions are less confident than usual -- {pct_borderline:.0f}% of your customers "
            "fall into a borderline risk range the model is unsure about."
        )
    return (
        f"Many predictions sit close to the borderline -- {pct_borderline:.0f}% of your customers land in a "
        "range the model is genuinely unsure about."
    )


def _shap_faithfulness(entry, result) -> Optional[float]:
    """Correlates the existing KernelExplainer (wraps the full StackingClassifier,
    see generic/explainer.py) against a fresh shap.TreeExplainer on the
    StackingClassifier's fitted CatBoost base estimator -- CatBoost is exact/
    fast, so it acts as a faithfulness check on the (necessarily approximate,
    sampling-based) KernelExplainer values used everywhere else in the app.

    Returns None (never raises) whenever this can't be computed: the
    REUSE_MODEL path has no on-disk fingerprint to reload artifacts from,
    and any artifact/shape mismatch here must not break /predict. The caller
    redistributes this component's weight over the rest when it's None.
    """
    try:
        feature_cols = result.report.get("feature_columns") or []
        if not feature_cols or not entry.raw_features_by_id:
            return None

        model = artifacts.load_model(result.fingerprint)
        catboost_model = model.named_estimators_.get("catboost")
        if catboost_model is None:
            return None

        sample_raw = list(entry.raw_features_by_id.values())[:FAITHFULNESS_SAMPLE_SIZE]
        if len(sample_raw) < 2:
            return None
        sample_df = pd.DataFrame(sample_raw)[feature_cols]

        scaled_sample = generic_predictor.preprocess(sample_df, result.fingerprint)

        kernel_result = explain_high_risk_batch(
            scaled_sample, threshold=0.0, nsamples=config.SHAP_NSAMPLES_DEFAULT, fingerprint=result.fingerprint
        )
        shap_cols = [c for c in kernel_result.columns if c not in ("churn_probability", "base_value")]
        kernel_matrix = kernel_result[shap_cols].to_numpy()

        tree_explainer = shap.TreeExplainer(catboost_model)
        tree_matrix = np.array(tree_explainer.shap_values(scaled_sample[shap_cols]))

        if kernel_matrix.shape != tree_matrix.shape or kernel_matrix.size < 2:
            return None

        correlation = np.corrcoef(kernel_matrix.flatten(), tree_matrix.flatten())[0, 1]
        if np.isnan(correlation):
            return None
        return round(max(0.0, float(correlation)) * 100, 1)
    except Exception:  # noqa: BLE001 -- best-effort signal, never blocks /predict
        return None


def _shap_faithfulness_text(tag: str, score: Optional[float]) -> str:
    if score is None:
        return "We couldn't independently double-check the model's reasoning for this run (expected when reusing a model trained on earlier data)."
    if tag == "good":
        return "The model's reasoning is consistent -- two independent methods of explaining its predictions agree closely on what drives risk."
    if tag == "caution":
        return "The model's reasoning shows some inconsistency between two independent explanation methods -- treat individual driver explanations with a little caution."
    return "The model's two explanation methods disagree substantially -- driver explanations for individual customers may not be reliable."


def _drift_stability(result) -> Tuple[float, bool, Optional[str]]:
    """Returns (score, applicable, drift_state). `applicable` is False for a
    freshly trained/cached model, which has nothing yet to have drifted from
    -- the text generator must not claim a stability comparison that never
    actually happened."""
    if result.reused_model and "driftState" in result.reused_model:
        drift_state = result.reused_model["driftState"]
        return _DRIFT_STATE_SCORES.get(drift_state, 100.0), True, drift_state
    return 100.0, False, None


def _drift_stability_text(tag: str, applicable: bool, drift_state: Optional[str]) -> str:
    if not applicable:
        return "This is a freshly trained model, so there's no prior upload yet to compare customer behavior against."
    if drift_state == "none":
        return "Customer behavior patterns look stable compared to your last upload."
    if drift_state == "moderate":
        return "Customer behavior has shifted somewhat compared to your last upload -- worth keeping an eye on."
    return "Customer behavior has shifted significantly compared to your last upload -- consider retraining soon."


_COMPONENT_LABELS = {
    "schemaCompleteness": "How complete your uploaded data was",
    "sampleSizeAdequacy": "Whether you gave the model enough customers to learn from",
    "shapFaithfulness": "How consistent the model's reasoning is",
    "confidenceSpread": "How confident the model is overall",
    "driftStability": "How stable customer behavior looks compared to before",
}


def _reliability_score(entry, result, all_recognized_fields: List[str]) -> Dict[str, Any]:
    row_count = result.report.get("n_rows_used") or len(result.customers)

    schema_info = _schema_completeness(entry.mapped_field_keys(), all_recognized_fields)
    shap_score = _shap_faithfulness(entry, result)
    drift_score, drift_applicable, drift_state = _drift_stability(result)

    scores = {
        "schemaCompleteness": schema_info["pct"],
        "sampleSizeAdequacy": _sample_size_adequacy(row_count),
        "shapFaithfulness": shap_score,
        "confidenceSpread": _confidence_spread(result.customers),
        "driftStability": drift_score,
    }

    available_weight = sum(RELIABILITY_WEIGHTS[k] for k, v in scores.items() if v is not None)
    weighted_sum = sum(RELIABILITY_WEIGHTS[k] * v for k, v in scores.items() if v is not None)
    reliability_score = round(weighted_sum / available_weight, 1) if available_weight else 0.0
    confidence_label, low_confidence = confidence_label_for(reliability_score)

    tags = {key: _tag_for_score(value) for key, value in scores.items()}
    texts = {
        "schemaCompleteness": _schema_completeness_text(tags["schemaCompleteness"], schema_info),
        "sampleSizeAdequacy": _sample_size_text(tags["sampleSizeAdequacy"], row_count),
        "shapFaithfulness": _shap_faithfulness_text(tags["shapFaithfulness"], shap_score),
        "confidenceSpread": _confidence_spread_text(tags["confidenceSpread"], result.customers),
        "driftStability": _drift_stability_text(tags["driftStability"], drift_applicable, drift_state),
    }

    components = {
        key: {
            "label": _COMPONENT_LABELS[key],
            "weight": RELIABILITY_WEIGHTS[key],
            "score": scores[key],
            "tag": tags[key],
            "text": texts[key],
        }
        for key in RELIABILITY_WEIGHTS
    }

    confidence_word = {"high": "High", "moderate": "Moderate", "low": "Low"}[confidence_label]
    narrative_lines = [
        f"{reliability_score:.0f}/100 -- {confidence_word} Confidence",
        "This score reflects how much you can trust these predictions.",
    ]
    for key in RELIABILITY_WEIGHTS:
        narrative_lines.append(f"{TAG_SYMBOL[components[key]['tag']]} {components[key]['text']}")
    narrative = "\n".join(narrative_lines)

    return {
        "reliabilityScore": reliability_score,
        "confidenceLabel": confidence_label,
        "lowConfidence": low_confidence,
        "reliabilityBreakdown": {"narrative": narrative, "components": components},
    }


# ============================================================ Market impact ==

# General reference figures for average ANNUAL customer churn, by industry --
# static, cited approximations for context, never live market data. Picked
# from commonly-cited industry churn-benchmark ranges; not sourced from a
# single dataset, so treat them as a ballpark, not a statistic to defend.
INDUSTRY_BENCHMARKS = {
    "saas": {"label": "SaaS", "low": 35, "high": 50, "keywords": ["saas", "software"]},
    "subscription_media": {
        "label": "subscription media", "low": 30, "high": 40,
        "keywords": ["media", "streaming", "subscription"],
    },
    "telecom": {"label": "telecom", "low": 15, "high": 25, "keywords": ["telecom", "telco", "wireless", "carrier"]},
    "retail_ecommerce": {
        "label": "retail / e-commerce", "low": 20, "high": 30,
        "keywords": ["retail", "ecommerce", "e-commerce", "commerce", "shop"],
    },
    "banking_financial": {
        "label": "banking / financial services", "low": 10, "high": 15,
        "keywords": ["bank", "banking", "financial", "finance", "insurance"],
    },
}
GENERIC_BENCHMARK = {"label": "a general cross-industry", "low": 20, "high": 30}
_INDUSTRY_COLUMN_ALIASES = ("industry", "vertical", "sector", "businesstype", "companytype")

# General reference figures for average ANNUAL revenue per customer, by
# industry -- same static-reference-not-live-data caveat as
# INDUSTRY_BENCHMARKS above, and keyed identically so _benchmark_for()'s
# industry detection (real column, or None) drives both tables together
# rather than duplicating that detection logic a second time.
INDUSTRY_AVG_REVENUE_PER_CUSTOMER = {
    "saas": 1200,
    "subscription_media": 150,
    "telecom": 600,
    "retail_ecommerce": 300,
    "banking_financial": 2000,
}
# Plain mean of the five figures above -- used only when neither a revenue
# field nor a detectable industry exists, so there is nothing more specific
# to anchor to.
GENERIC_AVG_REVENUE_PER_CUSTOMER = round(sum(INDUSTRY_AVG_REVENUE_PER_CUSTOMER.values()) / len(INDUSTRY_AVG_REVENUE_PER_CUSTOMER))


def _detect_industry(entry) -> Optional[str]:
    """Best-effort only: an uploaded column literally named industry/vertical/
    sector, keyword-matched to one of INDUSTRY_BENCHMARKS. No such field
    exists in ChurnGuard's canonical schema (shared/churnguardFields.json)
    today, so most datasets fall through to the generic cross-industry
    benchmark -- the explanation text says so explicitly when that happens."""
    try:
        raw_df = entry.raw_df
        if raw_df is None or raw_df.empty:
            return None
        columns = {str(c).lower().replace(" ", "").replace("_", ""): c for c in raw_df.columns}
    except Exception:  # noqa: BLE001 -- best-effort detection only
        return None
    for alias in _INDUSTRY_COLUMN_ALIASES:
        if alias not in columns:
            continue
        try:
            values = raw_df[columns[alias]].dropna().astype(str).str.lower()
        except Exception:  # noqa: BLE001
            continue
        if values.empty:
            continue
        mode_value = values.mode().iat[0]
        for industry_key, info in INDUSTRY_BENCHMARKS.items():
            if any(kw in mode_value for kw in info["keywords"]):
                return industry_key
    return None


def _benchmark_for(entry) -> Tuple[str, Dict[str, Any]]:
    industry_key = _detect_industry(entry)
    if industry_key:
        return industry_key, INDUSTRY_BENCHMARKS[industry_key]
    return "generic", GENERIC_BENCHMARK


def _severity_label(ratio: Optional[float]) -> str:
    if ratio is None:
        return "Moderate"
    if ratio < 0.75:
        return "Low"
    if ratio <= 1.15:
        return "Moderate"
    if ratio <= 1.5:
        return "High"
    return "Critical"


def _compounding_trajectory(total_customers: int, churn_rate_fraction: float, avg_annual_value: float) -> Dict[str, float]:
    """Projects 12 months forward assuming this churn rate recurs each
    quarter on the remaining base (quarterly compounding), not just a single
    snapshot multiplied by four. Each quarter's churners are assumed to churn
    uniformly through that quarter (same mid-period timing assumption as the
    single-period projection below), so they contribute half of that
    quarter's revenue plus the full value of every quarter remaining after
    it in the 12-month window."""
    remaining = total_customers
    cumulative_customers = 0.0
    cumulative_revenue = 0.0
    for q in range(4):
        lost_this_quarter = remaining * churn_rate_fraction
        quarters_of_value_lost_this_year = (4 - q - 1) + 0.5
        cumulative_revenue += lost_this_quarter * avg_annual_value * (quarters_of_value_lost_this_year / 4)
        cumulative_customers += lost_this_quarter
        remaining -= lost_this_quarter
    return {
        "cumulativeLostCustomers": round(cumulative_customers, 1),
        "cumulativeLostRevenue": round(cumulative_revenue, 2),
    }


def _fmt_money(x: float) -> str:
    sign = "-" if x < 0 else ""
    x = abs(x)
    if x >= 1_000_000:
        return f"{sign}${x / 1_000_000:.1f}M"
    if x >= 1_000:
        return f"{sign}${x / 1_000:.0f}K"
    return f"{sign}${x:,.0f}"


def _benchmark_phrase(r: Dict[str, Any]) -> str:
    # The generic fallback benchmark has no industry to name, so it gets its
    # own sentence rather than being slotted into the industry one -- doing
    # that produced "the average churn rate in a general cross-industry is
    # around 20-30%".
    if r["benchmarkIsGeneric"]:
        return (
            f"For context, a typical churn rate across industries is around {r['benchmarkUsed']} annually "
            "(a general reference figure, not live market data)."
        )
    label = r["benchmarkIndustry"]
    return (
        f"For context, the average churn rate in {label} is around {r['benchmarkUsed']} annually "
        f"(a general reference figure for {label}, not live market data)."
    )


def _severity_phrase(ratio: Optional[float], generic: bool = False) -> str:
    # With the generic fallback benchmark there is no detected industry, so
    # "for your industry" would be claiming more than we know.
    scope = "" if generic else " for your industry"
    if ratio is None:
        return ""
    if ratio > 1.05:
        return f"So your churn rate is currently running about {ratio:.1f}x higher than typical{scope}."
    if ratio < 0.95:
        return f"So your churn rate is currently running below typical{scope} (about {ratio:.1f}x the benchmark rate)."
    return f"So your churn rate is currently running roughly in line with the typical range{scope}."


def _confidence_level_for_real_data(at_risk_count: int, priced_at_risk_count: int) -> str:
    """High/Medium/Low reflects how much of the AT-RISK group actually has a
    priced value -- that's the population the loss figure is built from, not
    the whole customer base. Never "Estimated": that label is reserved for
    the no-revenue-field, industry-average fallback path."""
    if at_risk_count == 0:
        return "High"  # nothing to project, so no coverage ambiguity either
    coverage = priced_at_risk_count / at_risk_count
    if coverage >= 0.9:
        return "High"
    if coverage >= 0.5:
        return "Medium"
    return "Low"


def _impact_headline(severity: str, confidence_level: str) -> str:
    """A severity label is never shown bare unless it's backed by the
    dataset's own, largely-complete revenue data -- otherwise it carries a
    confidence qualifier so a reader can't mistake an estimate for a fact."""
    if confidence_level == "High":
        return f"{severity} Business Impact"
    return f"{severity} Business Impact ({confidence_level})"


def _market_impact_explanation(entry, customers: List[Dict[str, Any]]) -> Dict[str, Any]:
    total = len(customers)
    at_risk = [c for c in customers if c["riskTier"] in ("high", "critical")]
    churn_rate_pct = round((len(at_risk) / total) * 100, 1) if total else 0.0

    industry_key, benchmark = _benchmark_for(entry)
    benchmark_mid = (benchmark["low"] + benchmark["high"]) / 2
    ratio = round(churn_rate_pct / benchmark_mid, 2) if benchmark_mid else None
    severity = _severity_label(ratio)

    result: Dict[str, Any] = {
        "churnRatePct": churn_rate_pct,
        "atRiskCount": len(at_risk),
        "totalCustomers": total,
        "benchmarkIndustry": benchmark["label"],
        "benchmarkUsed": f"{benchmark['low']}-{benchmark['high']}%",
        # The same range as benchmarkUsed, unformatted, so the UI can render
        # it without picking the string apart.
        "benchmarkLow": benchmark["low"],
        "benchmarkHigh": benchmark["high"],
        "benchmarkIsGeneric": industry_key == "generic",
        "vsBenchmarkRatio": ratio,
        "severity": severity,
    }

    if total == 0:
        # Genuinely nothing to estimate for -- not the ordinary "no revenue
        # field" case (that always gets an industry-average estimate below),
        # only this fully degenerate one.
        result.update({
            "hasRevenueData": False, "isEstimated": False, "confidenceLevel": "Low",
            "impactHeadline": _impact_headline(severity, "Low"),
            "projectedAnnualLoss": None, "cumulativeLoss12mo": None, "cumulativeCustomerLoss12mo": None,
            "explanation": "No customers were scored for this dataset, so no financial impact can be estimated.",
        })
        return result

    priced_at_risk = [c for c in at_risk if c.get("monthlyCharges") is not None]
    has_revenue_data = any(c.get("monthlyCharges") is not None for c in customers)

    if not has_revenue_data:
        # No billing field at all -- estimate from typical revenue per
        # customer for the detected (or generic) industry rather than
        # leaving the reader with a blank. Always clearly marked as an
        # estimate, both in the data (isEstimated/confidenceLevel) and in
        # the text itself.
        avg_revenue = INDUSTRY_AVG_REVENUE_PER_CUSTOMER.get(industry_key, GENERIC_AVG_REVENUE_PER_CUSTOMER)
        estimated_annual_loss = round(len(at_risk) * avg_revenue, 2)

        result["hasRevenueData"] = False
        result["isEstimated"] = True
        result["confidenceLevel"] = "Estimated"
        result["impactHeadline"] = _impact_headline(severity, "Estimated")
        result["avgRevenuePerCustomer"] = avg_revenue
        result["projectedAnnualLoss"] = estimated_annual_loss
        result["cumulativeLoss12mo"] = None
        result["cumulativeCustomerLoss12mo"] = None

        if result["benchmarkIsGeneric"]:
            estimate_basis = f"a general cross-industry average of {_fmt_money(avg_revenue)} per customer per year"
        else:
            estimate_basis = (
                f"typical revenue-per-customer figures for {result['benchmarkIndustry']} "
                f"(about {_fmt_money(avg_revenue)} per customer per year)"
            )
        lines = [
            f"Your churn rate is currently {churn_rate_pct}% ({len(at_risk)} of {total} customers).",
            f"You didn't include a revenue field in this upload, so we've estimated the financial impact using "
            f"{estimate_basis}: roughly {_fmt_money(estimated_annual_loss)} per year at risk. This is an "
            "estimate, not your actual numbers. Connecting billing data gives a more precise figure.",
            _benchmark_phrase(result),
            _severity_phrase(ratio, result["benchmarkIsGeneric"]),
            "The revenue estimate above should still be treated as a rough figure, not a precise result.",
        ]
        result["explanation"] = "\n\n".join(line for line in lines if line)
        return result

    # Real revenue data. Partial-year timing: churn events are assumed to
    # land uniformly across the year, not all on day one, so on average an
    # at-risk account that actually churns keeps paying for about half the
    # year before leaving.
    full_annual_value_at_risk = sum(c["monthlyCharges"] * 12 for c in priced_at_risk)
    projected_annual_loss = round(full_annual_value_at_risk * 0.5, 2)

    priced_all = [c for c in customers if c.get("monthlyCharges") is not None]
    avg_annual_value = sum(c["monthlyCharges"] * 12 for c in priced_all) / len(priced_all) if priced_all else 0.0
    cumulative = _compounding_trajectory(total, churn_rate_pct / 100, avg_annual_value)

    confidence_level = _confidence_level_for_real_data(len(at_risk), len(priced_at_risk))

    result["hasRevenueData"] = True
    result["isEstimated"] = False
    result["confidenceLevel"] = confidence_level
    result["impactHeadline"] = _impact_headline(severity, confidence_level)
    result["projectedAnnualLoss"] = projected_annual_loss
    result["cumulativeLoss12mo"] = cumulative["cumulativeLostRevenue"]
    result["cumulativeCustomerLoss12mo"] = cumulative["cumulativeLostCustomers"]

    lines = [
        f"Your churn rate is currently {churn_rate_pct}% ({len(at_risk)} of {total} customers).",
        f"If this continues unchanged, you're on track to lose approximately {_fmt_money(projected_annual_loss)} "
        "in annual revenue from these customers alone.",
        _benchmark_phrase(result),
        _severity_phrase(ratio, result["benchmarkIsGeneric"]),
        f"If nothing changes, at this pace you could see a cumulative loss of roughly "
        f"{_fmt_money(cumulative['cumulativeLostRevenue'])} over the next 12 months as at-risk customers "
        "continue to churn at the current rate.",
    ]
    result["explanation"] = "\n\n".join(line for line in lines if line)
    return result


# =================================================================== entry ==

def compute_dataset_metrics(entry, result, all_recognized_fields: List[str]) -> Optional[Dict[str, Any]]:
    """Entry point. `entry` is the DatasetEntry the request is scoring
    (backend/api/store.py), `result` the TrainingResult train_and_score() just
    produced (backend/api/training.py). Returns None when there are no
    customers to compute anything from."""
    if not result.customers:
        return None

    revenue_at_risk = _revenue_at_risk(result.customers)
    reliability = _reliability_score(entry, result, all_recognized_fields)
    market_impact = _market_impact_explanation(entry, result.customers)

    return {
        "revenueAtRisk": revenue_at_risk,
        "reliabilityScore": reliability["reliabilityScore"],
        "confidenceLabel": reliability["confidenceLabel"],
        "lowConfidence": reliability["lowConfidence"],
        "marketImpactSeverity": market_impact["severity"],
        "marketImpactExplanation": market_impact["explanation"],
        "componentBreakdown": {
            "reliability": reliability["reliabilityBreakdown"],
            "marketImpact": market_impact,
        },
    }
