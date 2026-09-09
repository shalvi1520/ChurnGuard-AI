"""
Ties providers.py and prompts.py together for LLM-assisted column mapping --
structural sibling of explain_generator.py/outreach_generator.py. Used only
when the deterministic/heuristic matcher in backend/api/mapping.py couldn't
confidently resolve a REQUIRED field on its own (see dataset_routes.py's
POST /datasets/{id}/suggest-mapping); never called for every column.
"""
import json
import re
from typing import Any, Dict, List, Optional

from . import prompts, providers


class MappingSuggestionError(Exception):
    """The model's response couldn't be turned into a usable mapping suggestion."""


def _extract_json(text: str) -> dict:
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else None
    if candidate is None:
        brace = re.search(r"\{.*\}", text, re.DOTALL)
        candidate = brace.group(0) if brace else None
    if candidate is None:
        raise MappingSuggestionError("The model didn't return a JSON object.")
    try:
        return json.loads(candidate)
    except json.JSONDecodeError as exc:
        raise MappingSuggestionError(f"The model's response wasn't valid JSON: {exc}") from exc


def suggest_column_mapping(field: Dict[str, Any], candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
    """`field` is one entry from schema.CHURNGUARD_FIELDS. `candidates` is
    [{"name": str, "samples": [str, ...]}] for each still-unclaimed column.
    Returns {"column": str|None, "confidence": float, "reasoning": str, "provider": str}.

    A column name the model returns that isn't actually one of `candidates`
    is treated as no match rather than trusted -- the model must not be able
    to invent a mapping to a column that was never offered to it."""
    messages = prompts.build_mapping_messages(field, candidates)
    text, provider = providers.invoke_with_fallback(messages)
    parsed = _extract_json(text)

    candidate_names = {c["name"] for c in candidates}
    column: Optional[str] = parsed.get("column") or None
    if column is not None and column not in candidate_names:
        column = None

    try:
        confidence = max(0.0, min(1.0, float(parsed.get("confidence", 0.0))))
    except (TypeError, ValueError):
        confidence = 0.0
    if column is None:
        confidence = 0.0

    return {
        "column": column,
        "confidence": round(confidence, 3),
        "reasoning": str(parsed.get("reasoning", "")).strip(),
        "provider": provider,
    }
