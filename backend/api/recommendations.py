"""
Deterministic, rule-based recommendations built from a customer's real top
SHAP drivers -- no LLM, no invented per-customer facts. Each rule keys off
a feature-name family (generic across any dataset mapped onto
CHURNGUARD_FIELDS, not Telco-specific wording) and only fires for drivers
that are actually pushing risk up (positive SHAP value). `reason` is built
from the real feature/value/shap effect; nothing here is fabricated.
"""
from typing import Any, Dict, List

from . import schema

TOP_N_RECOMMENDATIONS = 4

# Ordered by how directly actionable each family is. Matched by substring
# against the (already snake_case) feature name.
_RULES = [
    {
        "match": ("contract_type",),
        "title": "Offer an incentive to move to a longer contract",
        "description": "This account's contract terms are associated with higher churn risk in the trained model. A longer commitment tends to reduce churn.",
        "suggested_action": "Offer a discount or added value in exchange for moving to an annual (or longer) contract.",
        "category": "contract",
    },
    {
        "match": ("tenure",),
        "title": "Prioritize an onboarding or check-in touchpoint",
        "description": "Tenure is one of the strongest signals the model found for this account -- newer relationships carry more churn risk before they've had time to establish value.",
        "suggested_action": "Schedule a proactive check-in to confirm the account is getting value early, before risk compounds.",
        "category": "onboarding",
    },
    {
        "match": ("monthly_charges", "total_charges"),
        "title": "Review pricing and perceived value",
        "description": "Billing amount is a meaningful driver of this account's risk score. High charges relative to usage often precede churn.",
        "suggested_action": "Review whether the current plan matches this account's actual usage, and consider a pricing or packaging conversation.",
        "category": "pricing",
    },
    {
        "match": ("payment_method",),
        "title": "Check for billing friction",
        "description": "This account's payment method is associated with higher churn risk in the trained model -- often a proxy for billing friction or failed payments.",
        "suggested_action": "Confirm the account's payment method is working smoothly and offer to switch to a more reliable option if not.",
        "category": "billing",
    },
    {
        "match": ("service_tier",),
        "title": "Review product/service fit",
        "description": "This account's current service tier is associated with higher churn risk in the trained model, which can indicate a mismatch between the tier and the account's needs.",
        "suggested_action": "Confirm the account is on the tier that best fits its usage pattern.",
        "category": "product-fit",
    },
]

_DEFAULT_RULE = {
    "title": "Investigate this risk factor directly",
    "description": "This factor moves the account's risk score but doesn't match one of ChurnGuard's known action templates.",
    "suggested_action": "Review this field with the account owner to understand what's driving it.",
    "category": "engagement",
}


def _priority_for(rank: int, shap_value: float) -> str:
    if rank == 0 and shap_value > 0.15:
        return "critical"
    if rank == 0 or shap_value > 0.1:
        return "high"
    if shap_value > 0.03:
        return "medium"
    return "low"


def _impact_score(shap_value: float, max_abs: float) -> int:
    if max_abs <= 0:
        return 0
    return max(1, min(100, round(abs(shap_value) / max_abs * 100)))


def build_recommendations(customer_id: str, drivers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """`drivers` is the same shape explainer.run() / the explanation endpoint
    produce: [{feature, value, shap_value}], sorted by |shap_value| desc."""
    increasing = [d for d in drivers if d.get("shap_value", 0) > 0]
    if not increasing:
        return []

    max_abs = max(abs(d["shap_value"]) for d in increasing)
    recs = []
    for rank, driver in enumerate(increasing[:TOP_N_RECOMMENDATIONS]):
        feature = str(driver["feature"])
        rule = next((r for r in _RULES if any(m in feature for m in r["match"])), None)
        template = rule or _DEFAULT_RULE

        recs.append({
            "id": f"REC-{customer_id}-{rank + 1}",
            "customerId": customer_id,
            "priority": _priority_for(rank, driver["shap_value"]),
            "title": template["title"],
            "description": template["description"],
            "expectedImpact": "high" if rank == 0 else "medium" if rank < 2 else "low",
            "impactScore": _impact_score(driver["shap_value"], max_abs),
            "reason": f"{schema.pretty_feature_name(feature)} = {driver['value']} is pushing this account's risk score up (effect +{driver['shap_value']:.2f}).",
            "suggestedAction": template["suggested_action"],
            "status": "pending",
            "category": template["category"],
        })
    return recs
