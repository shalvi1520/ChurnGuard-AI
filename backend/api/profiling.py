"""
Dataset profiling and validation: what is actually in the uploaded file.

Everything reported here is measured from the user's data -- there is no
invented "dataset health" score, deliberately (see PROJECT_MEMORY.md). The
per-column statistics also feed the automatic column matcher in mapping.py,
which uses real value evidence (uniqueness, numeric-ness, distinct counts)
and not just column names.
"""
import re
from typing import Any, Dict, List, Optional

import pandas as pd

from . import mapping, schema

PREVIEW_ROW_COUNT = 5
MISSING_TOKENS = {"", "na", "n/a", "null", "none", "nan", "-", "?"}
# Enough to tell a two-value churn column from a many-value one and to show
# the user what a categorical column actually contains, without dragging a
# 7,000-value identifier column into the response.
MAX_DISTINCT_SAMPLE = 25


def is_missing_value(value: Any) -> bool:
    return str(value if value is not None else "").strip().lower() in MISSING_TOKENS


def _as_number(text: str) -> Optional[float]:
    """Parses a value the way a person would read it: `$1,299.50`, `45%` and
    `1 299` are all numbers. Returns None when it genuinely isn't one."""
    cleaned = re.sub(r"[$£€₹,%\s]", "", text)
    if cleaned in ("", "-", "+", "."):
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _infer_column_type(values: List[str], unique_count: int, row_count: int, numeric_ratio: float) -> str:
    if not values:
        return "empty"
    if numeric_ratio >= 0.9:
        return "numeric"
    if row_count > 4 and unique_count == row_count:
        return "identifier"
    if unique_count <= max(2, round(row_count * 0.05)):
        return "categorical"
    return "text"


def profile_dataframe(df: pd.DataFrame) -> Dict[str, Any]:
    """`df` should be read with all values as strings (no NaN coercion) so
    missing-value detection matches one consistent token rule everywhere."""
    row_count = len(df)
    column_count = len(df.columns)

    column_stats = []
    for name in df.columns:
        values: List[str] = []
        numbers: List[float] = []
        missing = 0
        seen: Dict[str, int] = {}

        for raw in df[name]:
            if is_missing_value(raw):
                missing += 1
                continue
            value = str(raw).strip()
            values.append(value)
            seen[value] = seen.get(value, 0) + 1
            number = _as_number(value)
            if number is not None:
                numbers.append(number)

        filled = len(values)
        unique_count = len(seen)
        numeric_ratio = (len(numbers) / filled) if filled else 0.0
        integer_ratio = (sum(1 for n in numbers if float(n).is_integer()) / len(numbers)) if numbers else 0.0

        stat = {
            "name": name,
            "type": _infer_column_type(values, unique_count, row_count, numeric_ratio),
            "missing": missing,
            "missingPercent": (missing / row_count * 100) if row_count else 0,
            "unique": unique_count,
            "uniqueRatio": (unique_count / filled) if filled else 0.0,
            "sample": values[0] if values else "",
            "numericRatio": numeric_ratio,
            "integerRatio": integer_ratio,
            # Only carried for genuinely low-cardinality columns -- this is what
            # lets the matcher recognise a Yes/No churn outcome by its values.
            "distinctValues": sorted(seen.keys())[:MAX_DISTINCT_SAMPLE] if unique_count <= MAX_DISTINCT_SAMPLE else [],
        }
        if numbers:
            stat["numericStats"] = {
                "min": min(numbers),
                "max": max(numbers),
                "mean": sum(numbers) / len(numbers),
            }
        column_stats.append(stat)

    total_cells = row_count * column_count
    missing_cells = sum(c["missing"] for c in column_stats)
    duplicate_rows = int(df.duplicated().sum()) if row_count else 0

    preview = [
        {col: ("" if pd.isna(row[col]) else str(row[col])) for col in df.columns}
        for _, row in df.head(PREVIEW_ROW_COUNT).iterrows()
    ]

    return {
        "rowCount": row_count,
        "columnCount": column_count,
        "columns": column_stats,
        "missingCells": missing_cells,
        "missingPercent": (missing_cells / total_cells * 100) if total_cells else 0,
        "duplicateRows": duplicate_rows,
        "emptyColumns": [c["name"] for c in column_stats if c["type"] == "empty"],
        "preview": preview,
    }


def _pluralize(count: int, singular: str, plural: Optional[str] = None) -> str:
    plural = plural or f"{singular}s"
    return singular if count == 1 else plural


def _public_columns(column_stats: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """The column list the UI renders -- the matcher's internal evidence
    fields stay server-side so the response doesn't balloon on wide files."""
    return [
        {
            "name": c["name"],
            "type": c["type"],
            "missing": c["missing"],
            "missingPercent": round(c["missingPercent"], 2),
            "unique": c["unique"],
            "sample": c["sample"],
        }
        for c in column_stats
    ]


def build_validation_report(dataset_id: str, profile: Dict[str, Any]) -> Dict[str, Any]:
    """Runs the automatic matcher over the profile and reports, in plain
    language, everything that was measured plus anything that needs a decision.

    `issues` block processing; `warnings` are worth knowing but don't.
    """
    analysis = mapping.analyze(profile)

    warnings: List[Dict[str, str]] = []
    issues: List[Dict[str, str]] = []

    if profile["rowCount"] == 0:
        issues.append({
            "title": "This file has column headers but no customer rows.",
            "why": "There is nothing to analyse without at least one customer.",
            "action": "Check that the export actually included your data, then upload it again.",
        })
    elif profile["rowCount"] < 20:
        issues.append({
            "title": f"Only {profile['rowCount']} customer {_pluralize(profile['rowCount'], 'row')} in this file.",
            "why": "A churn model needs enough history to learn a pattern; ChurnGuard needs at least 20 customers, "
                   "with at least 6 of them having churned.",
            "action": "Upload an export covering your customer base, or try the demo dataset to see how it works.",
        })

    if profile["columnCount"] > 0 and len(profile["emptyColumns"]) == profile["columnCount"]:
        issues.append({
            "title": "Every column in this file is empty.",
            "why": "There are headers but no values underneath them, so there is nothing to analyse.",
            "action": "Check the export settings in your source system and upload the file again.",
        })

    # Required fields that could not be matched at all, and ones matched to a
    # column that can't actually do the job (e.g. a churn column with 5 values).
    # `field` tags which ChurnGuard field each issue is about -- purely
    # additive (existing frontend code doesn't read it), added so a missing
    # churn column can be told apart from any other missing-field issue
    # without string-matching on the (user-facing, copy-editable) title. See
    # dataset_routes.py's validate_dataset(): when a missing churn column
    # turns out not to be a dead end (resolve_training_eligibility() finds a
    # reusable model or a derivable proxy label), that specific issue is
    # removed from the response rather than left contradicting `eligibility`.
    for field in analysis["fields"]:
        if not field["required"]:
            continue
        if field["column"] is None:
            issues.append({
                "field": field["key"],
                "title": f"{field['label']} was not detected in this file.",
                "why": field["whyNeeded"],
                "action": f"Choose the column that holds it. {field['lookFor']}",
            })
        elif field["blocker"]:
            issues.append({
                "field": field["key"],
                "title": f"{field['label']}: {field['blocker']}",
                "why": field["whyNeeded"],
                "action": f"Pick a different column for {field['label']}. {field['lookFor']}",
            })

    if profile["missingCells"] > 0:
        affected = [c for c in profile["columns"] if c["missing"] > 0]
        worst = sorted(affected, key=lambda c: c["missing"], reverse=True)[:3]
        warnings.append({
            "title": f"{profile['missingCells']:,} empty {_pluralize(profile['missingCells'], 'value')} across "
                     f"{'1 column' if len(affected) == 1 else f'{len(affected)} columns'}",
            "why": "Customers with gaps are still included — ChurnGuard fills numeric gaps with that column's median "
                   "and treats missing categories as their own group.",
            "action": "Most affected: " + ", ".join(f"{c['name']} ({c['missing']})" for c in worst) + ".",
        })

    if profile["duplicateRows"] > 0:
        warnings.append({
            "title": f"{profile['duplicateRows']} identical {_pluralize(profile['duplicateRows'], 'row')}",
            "why": "A repeated customer would be counted more than once, which skews totals and revenue at risk.",
            "action": "ChurnGuard excludes exact duplicates automatically — no action needed.",
        })

    if profile["emptyColumns"] and not issues:
        n = len(profile["emptyColumns"])
        warnings.append({
            "title": f"{n} {_pluralize(n, 'column')} with no values",
            "why": "Columns that are entirely blank add nothing to the analysis.",
            "action": f"{', '.join(profile['emptyColumns'][:4])} will simply be ignored — no action needed.",
        })

    for field in analysis["fields"]:
        if field["column"] and field["level"] == "low" and not field["blocker"]:
            warnings.append({
                "title": f"{field['label']} was matched to \"{field['column']}\", but we're not certain",
                "why": "The column name and its values only partly match what this field usually looks like.",
                "action": f"Confirm or change it below. {field['lookFor']}",
            })

    status = "blocked" if issues else "warning" if warnings else "ready"

    return {
        "datasetId": dataset_id,
        "status": status,
        "rows": profile["rowCount"],
        "columns": _public_columns(profile["columns"]),
        "missingCells": profile["missingCells"],
        "missingPercent": round(profile["missingPercent"], 2),
        "duplicateRows": profile["duplicateRows"],
        "preview": profile["preview"],
        "warnings": warnings,
        "issues": issues,
        # Automatic mapping results -- see mapping.analyze() for the shape.
        "mapping": analysis,
        # Kept for the wire format the map-columns endpoint expects:
        # { fieldKey: columnName } for everything confidently matched.
        "suggestedMappings": analysis["autoMappings"],
        "requiredDetected": analysis["requiredDetected"],
        "requiredTotal": analysis["requiredTotal"],
        "optionalDetected": analysis["optionalDetected"],
        "optionalTotal": analysis["optionalTotal"],
        "additionalColumns": analysis["unmappedColumns"],
        "needsReview": analysis["needsReview"],
        "canAutoProcess": status != "blocked" and not analysis["needsReview"],
        # Superseded by dataset_routes.py's validate_dataset(), which attaches
        # an `eligibility` field (REUSE_MODEL/DERIVE_LABEL/BLOCKED, see
        # resolve_training_eligibility()) whenever churn is genuinely missing
        # -- a strict superset of what a bare recency-column guess covered.
    }


def churn_label_summary(values: List[Any]) -> Dict[str, Any]:
    """Distinct non-missing values of a churn column, for the pre-flight check
    the predict endpoint runs before handing the column to the trainer."""
    seen: Dict[str, int] = {}
    for raw in values:
        if is_missing_value(raw):
            continue
        key = str(raw).strip()
        seen[key] = seen.get(key, 0) + 1
    return {"distinct": sorted(seen.keys()), "counts": seen, "filled": sum(seen.values())}


# Re-exported so callers don't need to know the matcher lives in its own module.
FIELD_KEYS = [f["key"] for f in schema.CHURNGUARD_FIELDS]
