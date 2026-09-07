"""
Python mirror of src/mock/datasetSchema.js -- the canonical list of fields
a customer dataset maps onto. Kept in sync by hand (small, stable list);
this is the one place the backend defines "what ChurnGuard expects in a
customer dataset", matching the frontend's copy field-for-field so the
validation report/mapping step behave identically whether computed
client-side (mock mode) or server-side (real backend).
"""
import re
from typing import Dict, List, Optional

CHURNGUARD_FIELDS: List[Dict] = [
    {
        "key": "customer_id",
        "label": "Customer ID",
        "required": True,
        "aliases": ["customerid", "customer", "accountid", "account", "id", "userid", "subscriberid"],
    },
    {
        "key": "tenure",
        "label": "Tenure (months)",
        "required": True,
        "aliases": ["tenure", "tenuremonths", "months", "monthsactive", "customerage", "subscriptionmonths"],
    },
    {
        "key": "monthly_charges",
        "label": "Monthly charges",
        "required": True,
        "aliases": ["monthlycharges", "monthlycharge", "mrr", "monthlyrevenue", "monthlyfee", "arpu"],
    },
    {
        "key": "contract_type",
        "label": "Contract type",
        "required": True,
        "aliases": ["contract", "contracttype", "plan", "plantype", "subscriptiontype", "term"],
    },
    {
        "key": "churn",
        "label": "Churn label",
        "required": True,
        "aliases": ["churn", "churned", "ischurn", "ischurned", "attrition", "exited", "cancelled", "canceled"],
    },
    {
        "key": "total_charges",
        "label": "Total charges",
        "required": False,
        "aliases": ["totalcharges", "totalcharge", "totalrevenue", "lifetimevalue", "ltv"],
    },
    {
        "key": "service_tier",
        "label": "Service / product tier",
        "required": False,
        "aliases": ["internetservice", "service", "servicetier", "product", "producttier", "tier", "package"],
    },
    {
        "key": "payment_method",
        "label": "Payment method",
        "required": False,
        "aliases": ["paymentmethod", "payment", "billingmethod", "paymenttype"],
    },
]

REQUIRED_FIELDS = [f for f in CHURNGUARD_FIELDS if f["required"]]
FIELD_LABELS = {f["key"]: f["label"] for f in CHURNGUARD_FIELDS}


def pretty_feature_name(key: str) -> str:
    return FIELD_LABELS.get(key, key.replace("_", " ").capitalize())


def normalize_column_name(name: Optional[str]) -> str:
    return re.sub(r"[^a-z0-9]", "", str(name or "").lower())


def suggest_mappings(column_names: List[str]) -> Dict[str, str]:
    """Best-effort match of dataset columns onto ChurnGuard fields.
    Returns {fieldKey: columnName} -- only confident matches, mirrors
    suggestMappings() in src/mock/datasetSchema.js."""
    normalized = [(name, normalize_column_name(name)) for name in column_names]
    taken = set()
    suggestions: Dict[str, str] = {}

    for field_def in CHURNGUARD_FIELDS:
        match = None
        for name, key in normalized:
            if name in taken:
                continue
            if key == normalize_column_name(field_def["key"]):
                match = name
                break
        if match is None:
            for name, key in normalized:
                if name in taken:
                    continue
                if key in field_def["aliases"]:
                    match = name
                    break
        if match is not None:
            suggestions[field_def["key"]] = match
            taken.add(match)

    return suggestions
