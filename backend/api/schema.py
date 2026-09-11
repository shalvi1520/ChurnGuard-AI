"""
The canonical ChurnGuard field list, loaded from shared/churnguardFields.json.

That JSON file is THE definition -- the frontend (src/mock/datasetSchema.js)
reads the exact same file, so the two sides cannot drift apart. This module
only adds Python-side conveniences (lookups, name normalisation) on top of it.

Automatic column matching lives in mapping.py, not here.
"""
import json
import os
import re
from typing import Any, Dict, List, Optional

_SHARED_PATH = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "shared", "churnguardFields.json")
)

with open(_SHARED_PATH, "r", encoding="utf-8") as _fh:
    _SCHEMA = json.load(_fh)

SCHEMA_VERSION: int = _SCHEMA["version"]
CHURNGUARD_FIELDS: List[Dict[str, Any]] = _SCHEMA["fields"]

REQUIRED_FIELDS = [f for f in CHURNGUARD_FIELDS if f["required"]]
OPTIONAL_FIELDS = [f for f in CHURNGUARD_FIELDS if not f["required"]]
FIELD_LABELS = {f["key"]: f["label"] for f in CHURNGUARD_FIELDS}
FIELD_BY_KEY = {f["key"]: f for f in CHURNGUARD_FIELDS}


def get_field(key: str) -> Optional[Dict[str, Any]]:
    return FIELD_BY_KEY.get(key)


def pretty_feature_name(key: str) -> str:
    return FIELD_LABELS.get(key, str(key).replace("_", " ").capitalize())


def normalize_column_name(name: Optional[str]) -> str:
    """Lowercases and strips every separator so `Monthly_Charges`,
    `monthly-charges` and `MonthlyCharges` all collapse to `monthlycharges`."""
    return re.sub(r"[^a-z0-9]", "", str(name or "").lower())


def tokenize_column_name(name: Optional[str]) -> List[str]:
    """Splits a column name into lowercase word tokens, handling snake_case,
    kebab-case, spaces and camelCase/PascalCase boundaries."""
    raw = str(name or "")
    spaced = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", raw)
    spaced = re.sub(r"(?<=[A-Za-z])(?=[0-9])", " ", spaced)
    parts = re.split(r"[^A-Za-z0-9]+", spaced)
    return [p.lower() for p in parts if p]
