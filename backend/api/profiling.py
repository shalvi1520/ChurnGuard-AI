"""
Python port of the profiling/validation logic that used to live client-side
in src/utils/csv.js + services/api.js's buildValidationReport(). Same rules,
same shapes, so the response looks identical whether it was ever computed in
the browser (old mock mode) or here (now that a real backend runs it).
"""
import math
import re
from typing import Any, Dict, List

import pandas as pd

from . import schema

PREVIEW_ROW_COUNT = 5
MISSING_TOKENS = {"", "na", "n/a", "null", "none", "nan", "-", "?"}


def is_missing_value(value: Any) -> bool:
    return str(value if value is not None else "").strip().lower() in MISSING_TOKENS


def _infer_column_type(values: List[str], unique_count: int, row_count: int) -> str:
    if not values:
        return "empty"

    numeric_count = 0
    for v in values:
        stripped = re.sub(r"[$,%\s]", "", v)
        try:
            float(stripped)
            numeric_count += 1
        except ValueError:
            pass
    if numeric_count / len(values) >= 0.9:
        return "numeric"

    if row_count > 4 and unique_count == row_count:
        return "identifier"

    if unique_count <= max(2, round(row_count * 0.05)):
        return "categorical"
    return "text"


def profile_dataframe(df: pd.DataFrame) -> Dict[str, Any]:
    """Mirrors profileDataset() in utils/csv.js. `df` should be read with
    all values as strings/objects (no NaN coercion) so missing-value
    detection matches the frontend's token-based rule exactly."""
    row_count = len(df)
    column_count = len(df.columns)

    column_stats = []
    for name in df.columns:
        col = df[name]
        values: List[str] = []
        missing = 0
        seen = set()
        for raw in col:
            if is_missing_value(raw):
                missing += 1
                continue
            value = str(raw).strip()
            values.append(value)
            seen.add(value)

        column_stats.append({
            "name": name,
            "type": _infer_column_type(values, len(seen), row_count),
            "missing": missing,
            "missingPercent": (missing / row_count * 100) if row_count else 0,
            "unique": len(seen),
            "sample": values[0] if values else "",
        })

    total_cells = row_count * column_count
    missing_cells = sum(c["missing"] for c in column_stats)

    duplicate_rows = int(df.duplicated().sum()) if row_count else 0

    preview_df = df.head(PREVIEW_ROW_COUNT)
    preview = [
        {col: ("" if pd.isna(row[col]) else str(row[col])) for col in df.columns}
        for _, row in preview_df.iterrows()
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


def _pluralize(count: int, singular: str, plural: str = None) -> str:
    plural = plural or f"{singular}s"
    return singular if count == 1 else plural


def build_validation_report(dataset_id: str, profile: Dict[str, Any], suggested_mappings: Dict[str, str]) -> Dict[str, Any]:
    """Mirrors buildValidationReport() in services/api.js."""
    missing_required = [f for f in schema.REQUIRED_FIELDS if f["key"] not in suggested_mappings]

    warnings: List[Dict[str, str]] = []
    issues: List[Dict[str, str]] = []

    if profile["rowCount"] < 2:
        issues.append({
            "title": "This file only contains a single customer row.",
            "why": "ChurnGuard compares customers against each other, so one row cannot produce a retention view.",
            "action": "Upload an export that contains your customer base, or continue with the demo dataset.",
        })

    if profile["columnCount"] > 0 and len(profile["emptyColumns"]) == profile["columnCount"]:
        issues.append({
            "title": "Every column in this file is empty.",
            "why": "There are headers but no values underneath them, so there is nothing to analyse.",
            "action": "Check the export settings in your source system and upload the file again.",
        })

    if profile["missingCells"] > 0:
        worst = sorted(
            [c for c in profile["columns"] if c["missing"] > 0],
            key=lambda c: c["missing"],
            reverse=True,
        )[:3]
        affected = len([c for c in profile["columns"] if c["missing"] > 0])
        worst_list = ", ".join(f"{c['name']} ({c['missing']})" for c in worst)
        warnings.append({
            "title": f"{profile['missingCells']:,} empty {_pluralize(profile['missingCells'], 'value')} across "
                     f"{'1 column' if affected == 1 else f'{affected} columns'}",
            "why": "Customers with gaps are still included, but the missing fields contribute less to their risk picture.",
            "action": f"Most affected: {worst_list}. "
                      "Fill these in your source system if they matter to you — otherwise you can continue.",
        })

    if profile["duplicateRows"] > 0:
        warnings.append({
            "title": f"{profile['duplicateRows']} identical {_pluralize(profile['duplicateRows'], 'row')}",
            "why": "A repeated customer is counted more than once, which skews totals and revenue at risk.",
            "action": "Remove the duplicates in your export if they were not intentional.",
        })

    if profile["emptyColumns"] and not issues:
        n = len(profile["emptyColumns"])
        warnings.append({
            "title": f"{n} {_pluralize(n, 'column')} with no values",
            "why": "Columns that are entirely blank add nothing to the analysis.",
            "action": f"{', '.join(profile['emptyColumns'][:4])} will simply be ignored — no action needed.",
        })

    if missing_required:
        warnings.append({
            "title": f"Couldn't automatically match {', '.join(f['label'] for f in missing_required)}",
            "why": "ChurnGuard needs these fields to build a customer view; your column names just differ from the ones we recognise.",
            "action": "Choose the matching column yourself in the next step.",
        })

    status = "blocked" if issues else "warning" if warnings else "ready"

    return {
        "datasetId": dataset_id,
        "status": status,
        "columns": profile["columns"],
        "missingCells": profile["missingCells"],
        "missingPercent": round(profile["missingPercent"], 2),
        "duplicateRows": profile["duplicateRows"],
        "preview": profile["preview"],
        "warnings": warnings,
        "issues": issues,
        "suggestedMappings": suggested_mappings,
        "requiredDetected": len(schema.REQUIRED_FIELDS) - len(missing_required),
        "requiredTotal": len(schema.REQUIRED_FIELDS),
    }
