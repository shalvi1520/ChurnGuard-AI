"""
Automatic column matching: works out which of the user's columns holds each
ChurnGuard field, so nobody has to configure a row of dropdowns.

Four signals are combined, because no single one is reliable on real exports:

  1. Exact name match         `customer_id`            -> Customer ID
  2. Known alias              `acct_no`, `client_ref`  -> Customer ID
  3. Normalised / semantic    `MonthsSubscribed`, `months_active` -> Tenure
     (case, separators and camelCase are ignored; remaining words are scored
      against each field's vocabulary, weighted so a word that belongs to only
      one field counts for more than one several fields share, e.g. "charges")
  4. Value evidence           a two-value Yes/No column is a plausible churn
                              outcome; a column where every value is different
                              is a plausible ID; charges must look numeric

Signal 4 is what stops a *name* alone from producing a wrong mapping: a column
called "Churn Reason" holding free text is rejected as the churn outcome even
though its name matches, and "account_manager" is rejected as Customer ID
because its values repeat.

Every match carries a confidence level, which decides how much the user is
asked to do:

  high   (>= 0.80) accepted silently
  medium (>= 0.55) accepted, but shown as "detected automatically" with a
                   one-click Change
  low    (>= 0.35) accepted as a suggestion but flagged for confirmation
  below            not a candidate at all
"""
from typing import Any, Dict, List, Optional, Tuple

from . import schema

HIGH_CONFIDENCE = 0.80
MEDIUM_CONFIDENCE = 0.55
MIN_CONFIDENCE = 0.35

# Words that mean the same thing as one of a field's vocabulary words. Applied
# to the tokenised column name before scoring, so `num_mths` reads as `months`.
_TOKEN_SYNONYMS = {
    "mth": "month", "mths": "months", "mo": "months", "mos": "months", "mnth": "month",
    "amt": "amount", "amnt": "amount", "qty": "quantity", "num": "number", "no": "number",
    "nbr": "number", "cust": "customer", "custs": "customers", "acct": "account",
    "sub": "subscription", "subs": "subscription", "svc": "service", "prod": "product",
    "rev": "revenue", "chg": "charge", "chgs": "charges", "avg": "average",
    "tot": "total", "ttl": "total", "pmt": "payment", "pay": "payment", "bill": "billing",
    "id": "id", "identifier": "id", "ref": "reference", "flg": "flag", "ind": "flag",
    "is": "flag", "has": "flag", "did": "flag", "dt": "date", "yn": "flag",
}

# Value pairs that read as a churn outcome. Compared case-insensitively against
# the two distinct values a candidate column actually contains.
_BINARY_VALUE_SETS = [
    {"yes", "no"}, {"y", "n"}, {"true", "false"}, {"t", "f"}, {"1", "0"}, {"1.0", "0.0"},
    {"churn", "nochurn"}, {"churned", "active"}, {"churned", "retained"}, {"churned", "stayed"},
    {"cancelled", "active"}, {"canceled", "active"}, {"cancelled", "retained"},
    {"left", "stayed"}, {"lost", "won"}, {"lost", "retained"}, {"inactive", "active"},
    {"closed", "open"}, {"terminated", "active"}, {"exited", "active"},
]

# Tokens that make a column a poor fit for a field regardless of what else
# matches -- a "signup_date" is not a tenure, a "churn_reason" is not an outcome.
_FIELD_NEGATIVE_TOKENS = {
    "tenure": {"date", "datetime", "timestamp", "start", "end", "expiry", "renewal", "birthday"},
    "churn": {"reason", "score", "probability", "risk", "prediction", "predicted", "date", "comment", "note"},
    "customer_id": {"name", "email", "phone", "manager", "owner", "segment", "type", "status"},
    "monthly_charges": {"total", "lifetime", "cumulative", "todate"},
    "total_charges": {"monthly", "permonth", "recurring"},
}


def _build_token_weights() -> Dict[str, float]:
    """A word shared by several fields is weaker evidence than one that belongs
    to a single field: "charges" appears in two vocabularies, "monthly" in one."""
    counts: Dict[str, int] = {}
    for field in schema.CHURNGUARD_FIELDS:
        for token in set(field["keywords"]):
            counts[token] = counts.get(token, 0) + 1
    return {token: 1.0 / n for token, n in counts.items()}


_TOKEN_WEIGHTS = _build_token_weights()


def _expand_tokens(name: str) -> List[str]:
    return [_TOKEN_SYNONYMS.get(t, t) for t in schema.tokenize_column_name(name)]


# ------------------------------------------------------------------ name score

def _name_score(column_name: str, field: Dict[str, Any]) -> Tuple[float, Optional[str]]:
    """0..1 for how much the column's *name* suggests this field, plus a
    plain-language reason for the strongest signal that fired."""
    normalized = schema.normalize_column_name(column_name)
    if not normalized:
        return 0.0, None

    if normalized == schema.normalize_column_name(field["key"]):
        return 1.0, "the column name matches this field exactly"

    aliases = field["aliases"]
    if normalized in aliases:
        return 0.94, f'"{column_name}" is a name we recognise for this field'

    # An alias buried inside a longer name: `customer_monthly_charges_usd`.
    contained = [a for a in aliases if len(a) >= 5 and a in normalized]
    if contained:
        longest = max(contained, key=len)
        coverage = len(longest) / len(normalized)
        return min(0.88, 0.58 + 0.30 * coverage), f'the name contains "{longest}"'

    tokens = _expand_tokens(column_name)
    if not tokens:
        return 0.0, None

    vocabulary = set(field["keywords"])
    matched = [t for t in tokens if t in vocabulary]
    if not matched:
        return 0.0, None

    strength = min(1.0, sum(_TOKEN_WEIGHTS.get(t, 0.5) for t in set(matched)))
    coverage = len(matched) / len(tokens)
    score = min(0.78, 0.34 + 0.44 * strength) * (0.62 + 0.38 * coverage)
    words = ", ".join(sorted(set(matched)))
    return score, f"the words {words} in the column name point at this field"


# -------------------------------------------------------------- value evidence

def _looks_boolean(values: List[str]) -> bool:
    lowered = {str(v).strip().lower() for v in values}
    return any(lowered == pair for pair in _BINARY_VALUE_SETS)


def _evidence(column: Dict[str, Any], field: Dict[str, Any], row_count: int) -> Tuple[float, List[str], Optional[str]]:
    """Returns (fit 0..1, supporting reasons, blocker).

    A blocker is a hard "this column cannot do this job" -- reported to the
    user rather than silently ignored, because it is usually the most useful
    thing we can tell them (e.g. a churn column with five different values).
    """
    expect = field.get("expect", {})
    kind = expect.get("kind")
    reasons: List[str] = []

    if column["type"] == "empty":
        return 0.0, [], "that column is empty"

    if kind == "identifier":
        ratio = column["uniqueRatio"]
        minimum = expect.get("uniqueRatioMin", 0.9)
        if ratio >= minimum:
            reasons.append(f"{ratio * 100:.0f}% of its values are unique")
            return 1.0, reasons, None
        if ratio >= 0.5:
            return 0.35, [f"only {ratio * 100:.0f}% of its values are unique"], None
        return 0.0, [], f"its values repeat too often to identify a customer ({column['unique']} distinct)"

    if kind == "numeric":
        ratio = column["numericRatio"]
        if ratio < 0.6:
            return 0.0, [], "its values aren't numbers"
        fit = 1.0 if ratio >= 0.95 else 0.6
        reasons.append("its values are numeric")
        stats = column.get("numericStats")
        if stats:
            if expect.get("min") is not None and stats["min"] < expect["min"]:
                fit *= 0.5
                reasons.append("but some values are negative")
            if expect.get("max") is not None and stats["max"] > expect["max"]:
                fit *= 0.4
                reasons.append(f"but values go up to {stats['max']:.0f}")
            if expect.get("integerish") and column["integerRatio"] >= 0.95:
                reasons.append("whole numbers, as months usually are")
        return fit, reasons, None

    if kind == "categorical":
        distinct = column["unique"]
        if distinct <= 1:
            return 0.0, [], "it only contains one value"
        max_distinct = expect.get("maxDistinct", 30)
        if distinct <= max_distinct and (row_count == 0 or distinct <= max(2, row_count * 0.5)):
            reasons.append(f"{distinct} repeating values, e.g. " + ", ".join(column["distinctValues"][:3]))
            return 1.0, reasons, None
        return 0.15, [], None

    if kind == "binary":
        distinct = column["unique"]
        if distinct == 2:
            values = column["distinctValues"]
            if _looks_boolean(values):
                return 1.0, [f"exactly two values ({' / '.join(values)}) — a yes-or-no outcome"], None
            return 0.8, [f"exactly two values ({' / '.join(values)})"], None
        if distinct <= 1:
            return 0.0, [], "every customer has the same value, so there is no churn to learn from"
        return 0.0, [], f"it has {distinct} different values, and a churn outcome needs exactly two"

    return 0.5, reasons, None


# -------------------------------------------------------------------- matching

def _candidates(profile: Dict[str, Any]) -> List[Dict[str, Any]]:
    row_count = profile["rowCount"]
    out: List[Dict[str, Any]] = []

    for field in schema.CHURNGUARD_FIELDS:
        for column in profile["columns"]:
            name_score, name_reason = _name_score(column["name"], field)
            fit, evidence_reasons, blocker = _evidence(column, field, row_count)

            negatives = _FIELD_NEGATIVE_TOKENS.get(field["key"], set())
            if negatives & set(_expand_tokens(column["name"])):
                name_score *= 0.35

            if name_score <= 0 and not (field["key"] in ("churn", "customer_id") and fit >= 0.95):
                continue

            if name_score <= 0:
                # Value evidence alone: a plausible candidate, never a confident
                # one -- capped below the auto-accept threshold on purpose.
                confidence = 0.45 * fit
                reasons = evidence_reasons
            else:
                confidence = name_score * (0.55 + 0.45 * fit)
                reasons = ([name_reason] if name_reason else []) + evidence_reasons

            out.append({
                "field": field,
                "column": column["name"],
                "confidence": round(min(1.0, confidence), 3),
                "reasons": reasons,
                "blocker": blocker,
                "nameScore": name_score,
            })

    out.sort(key=lambda c: (c["confidence"], c["nameScore"]), reverse=True)
    return out


def _disambiguate_charges(chosen: Dict[str, str], profile: Dict[str, Any]) -> Optional[str]:
    """`monthly_charges` and `total_charges` share most of their vocabulary, so
    a name like "subscription_value" can land on either. When both are mapped
    and the numbers say otherwise, swap them: total spend is essentially always
    larger than one month's charge."""
    monthly, total = chosen.get("monthly_charges"), chosen.get("total_charges")
    if not monthly or not total:
        return None
    by_name = {c["name"]: c for c in profile["columns"]}
    m_stats, t_stats = by_name[monthly].get("numericStats"), by_name[total].get("numericStats")
    if not m_stats or not t_stats:
        return None
    if m_stats["mean"] > t_stats["mean"] * 1.5:
        chosen["monthly_charges"], chosen["total_charges"] = total, monthly
        return (f'"{monthly}" holds much larger amounts than "{total}", so it was read as the lifetime total '
                f"and the two were swapped")
    return None


def _level(confidence: float) -> str:
    if confidence >= HIGH_CONFIDENCE:
        return "high"
    if confidence >= MEDIUM_CONFIDENCE:
        return "medium"
    return "low"


def analyze(profile: Dict[str, Any]) -> Dict[str, Any]:
    """Matches the profiled columns onto the ChurnGuard fields.

    Greedy, highest-confidence-first assignment: each column fills at most one
    field and each field takes at most one column, so the strongest match wins
    a contested column rather than whichever field happened to be listed first.
    """
    candidates = _candidates(profile)

    chosen: Dict[str, str] = {}
    detail: Dict[str, Dict[str, Any]] = {}
    blocked: Dict[str, Dict[str, Any]] = {}
    alternatives: Dict[str, List[Dict[str, Any]]] = {f["key"]: [] for f in schema.CHURNGUARD_FIELDS}
    taken_columns = set()

    for candidate in candidates:
        key = candidate["field"]["key"]
        if candidate["blocker"]:
            # Remember the best unusable candidate so we can explain *why* the
            # field is missing instead of just saying it wasn't found.
            blocked.setdefault(key, candidate)
            continue
        if candidate["confidence"] < MIN_CONFIDENCE:
            continue
        if key in chosen or candidate["column"] in taken_columns:
            if key in chosen and candidate["column"] not in taken_columns:
                alternatives[key].append({"column": candidate["column"], "confidence": candidate["confidence"]})
            continue
        chosen[key] = candidate["column"]
        detail[key] = candidate
        taken_columns.add(candidate["column"])

    swap_note = _disambiguate_charges(chosen, profile)

    fields_out: List[Dict[str, Any]] = []
    needs_review: List[str] = []

    for field in schema.CHURNGUARD_FIELDS:
        key = field["key"]
        column = chosen.get(key)
        info = detail.get(key)
        blocker_candidate = blocked.get(key) if column is None else None
        confidence = info["confidence"] if info else 0.0
        level = _level(confidence) if column else None
        reasons = list(info["reasons"]) if info else []
        if swap_note and key in ("monthly_charges", "total_charges"):
            reasons.append(swap_note)

        entry = {
            "key": key,
            "label": field["label"],
            "description": field["description"],
            "required": field["required"],
            "whyNeeded": field["whyNeeded"],
            "lookFor": field["lookFor"],
            "column": column,
            "confidence": confidence,
            "level": level,
            "reasons": reasons,
            "alternatives": alternatives[key][:4],
            # Set when the best candidate we found can't do the job, e.g. a
            # column named "Churn" that holds five different values.
            "blocker": (
                f"\"{blocker_candidate['column']}\" looks like the right column, but {blocker_candidate['blocker']}"
                if blocker_candidate else None
            ),
        }
        fields_out.append(entry)

        # Ask the user only when we genuinely can't decide: a required field we
        # couldn't match, or matched only weakly. A medium-confidence match is
        # shown as "detected automatically" with a Change action, not a blocker,
        # and optional fields never hold the flow up.
        if field["required"] and (column is None or level == "low"):
            needs_review.append(key)

    required = [f for f in fields_out if f["required"]]
    optional = [f for f in fields_out if not f["required"]]

    return {
        "fields": fields_out,
        "autoMappings": dict(chosen),
        "requiredDetected": sum(1 for f in required if f["column"]),
        "requiredTotal": len(required),
        "optionalDetected": sum(1 for f in optional if f["column"]),
        "optionalTotal": len(optional),
        "unmappedColumns": [c["name"] for c in profile["columns"] if c["name"] not in taken_columns],
        "needsReview": needs_review,
        "thresholds": {"high": HIGH_CONFIDENCE, "medium": MEDIUM_CONFIDENCE, "minimum": MIN_CONFIDENCE},
    }
