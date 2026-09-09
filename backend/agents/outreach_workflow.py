"""
The agentic post-training outreach pipeline: for every at-risk customer,
decide whether to draft outreach, draft it, validate it, and queue it for
human review -- never send. Runs automatically in the background right after
a dataset finishes training (backend/api/dataset_routes.py's POST /predict),
not on a per-customer button click, which stays available separately for
anyone below the automatic risk threshold.

    Customer Data -> Risk Classification -> Business Rule Check
        -> SHAP Explanation -> LLM Router -> Email Generation
        -> Validation -> Queue / Skip

A real LangGraph StateGraph, not a sequence of function calls renamed to
look like one: risk classification and the business-rule check are a real
conditional edge that ends the run for an ineligible customer before any
SHAP or LLM cost is spent on them; a second conditional edge sits after SHAP
(no usable explanation -> skip, don't draft blind); a third after
validation (queue it or skip it, with a reason either way). Every node
returns a partial state update, per LangGraph convention -- see
backend/agents/orchestrator.py for the sibling graph this mirrors.

SHAP computation itself is not reimplemented here: `compute_drivers` is
injected by the caller (dataset_routes.py, which owns the trained model, its
caches, and the FastAPI-specific error handling around it) and invoked from
the `shap_explanation` node, so the graph still genuinely performs that step
without duplicating cache-aware code that already exists.
"""
from typing import Any, Callable, Dict, List, Optional, Set, TypedDict

from langgraph.graph import END, StateGraph

from . import business_rules, validation


class OutreachState(TypedDict, total=False):
    customer: Dict[str, Any]
    compute_drivers: Callable[[str], List[Dict[str, Any]]]
    already_drafted_ids: Set[str]
    eligible: bool
    drivers: List[Dict[str, Any]]
    provider_hint: str
    draft: Optional[Dict[str, Any]]
    valid: bool
    status: str  # 'queued' | 'skipped' | 'failed'
    reason: Optional[str]


def _risk_classification_node(state: OutreachState) -> dict:
    # The prediction step (outside this graph, in dataset_routes.py) already
    # produced a risk tier for every customer; this node is the seam a future
    # version would use for finer segmentation (e.g. "at-risk and high-value"
    # vs "at-risk, low-value") without touching anything downstream of it.
    return {}


def _business_rule_check_node(state: OutreachState) -> dict:
    eligible, reason = business_rules.is_eligible_for_auto_outreach(
        state["customer"], state.get("already_drafted_ids", set())
    )
    return {"eligible": eligible, "reason": reason}


def _route_after_business_rules(state: OutreachState) -> str:
    return "shap" if state["eligible"] else "skip"


def _shap_explanation_node(state: OutreachState) -> dict:
    try:
        drivers = state["compute_drivers"](state["customer"]["id"])
    except Exception as exc:  # noqa: BLE001 -- any explainer failure just skips this one customer
        return {"drivers": [], "status": "failed", "reason": f"couldn't compute an explanation: {exc}"}
    if not drivers:
        return {"drivers": [], "status": "failed", "reason": "no explanation was available for this account"}
    return {"drivers": drivers}


def _route_after_shap(state: OutreachState) -> str:
    return "route_llm" if state.get("drivers") else "skip"


def _llm_router_node(state: OutreachState) -> dict:
    # A single provider chain today (llm/providers.py's Groq -> Gemini ->
    # OpenAI fallback, picked per-call). This node is the seam a future
    # task-based router (a faster/cheaper model for routine drafts, a
    # stronger one for critical-risk accounts) plugs into without changing
    # the graph's shape -- see PROJECT_MEMORY.md's roadmap, item 11.
    return {"provider_hint": "default"}


def _generate_email_node(state: OutreachState) -> dict:
    from ..llm import outreach_generator  # optional extra -- missing langchain must not break training

    customer = state["customer"]
    pretty_drivers = [
        {"feature": d["feature"], "value": d["value"], "shap_value": d["shap_value"]}
        for d in state.get("drivers", [])[:5]
    ]
    try:
        result = outreach_generator.generate_outreach_message(
            customer["id"], customer["churnProbability"] / 100, pretty_drivers
        )
    except (RuntimeError, ImportError) as exc:
        return {"draft": None, "status": "failed", "reason": str(exc)}
    return {
        "draft": {"subject": result["subject"], "body": result["message"], "provider": result["provider"]}
    }


def _route_after_generate(state: OutreachState) -> str:
    return "validate" if state.get("draft") else "skip"


def _validate_node(state: OutreachState) -> dict:
    valid, reason = validation.validate_draft(state["draft"]["body"])
    return {"valid": valid, "reason": reason}


def _route_after_validate(state: OutreachState) -> str:
    return "queue" if state["valid"] else "skip"


def _queue_node(state: OutreachState) -> dict:
    return {"status": "queued"}


def _skip_node(state: OutreachState) -> dict:
    # A node upstream may have already set status='failed' with its own
    # reason; don't overwrite a real failure reason with a generic one.
    return {"status": state.get("status") or "skipped"}


def _build_graph():
    graph = StateGraph(OutreachState)
    graph.add_node("risk_classification", _risk_classification_node)
    graph.add_node("business_rule_check", _business_rule_check_node)
    graph.add_node("shap_explanation", _shap_explanation_node)
    graph.add_node("llm_router", _llm_router_node)
    graph.add_node("generate_email", _generate_email_node)
    graph.add_node("validate", _validate_node)
    graph.add_node("queue", _queue_node)
    graph.add_node("skip", _skip_node)

    graph.set_entry_point("risk_classification")
    graph.add_edge("risk_classification", "business_rule_check")
    graph.add_conditional_edges(
        "business_rule_check", _route_after_business_rules, {"shap": "shap_explanation", "skip": "skip"}
    )
    graph.add_conditional_edges(
        "shap_explanation", _route_after_shap, {"route_llm": "llm_router", "skip": "skip"}
    )
    graph.add_edge("llm_router", "generate_email")
    graph.add_conditional_edges(
        "generate_email", _route_after_generate, {"validate": "validate", "skip": "skip"}
    )
    graph.add_conditional_edges(
        "validate", _route_after_validate, {"queue": "queue", "skip": "skip"}
    )
    graph.add_edge("queue", END)
    graph.add_edge("skip", END)
    return graph.compile()


_compiled_graph = None


def _get_graph():
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = _build_graph()
    return _compiled_graph


def run_for_customer(
    customer: Dict[str, Any],
    compute_drivers: Callable[[str], List[Dict[str, Any]]],
    already_drafted_ids: Set[str],
) -> OutreachState:
    """Runs the graph for one customer and returns the final state --
    `status` is 'queued', 'skipped' or 'failed', with `reason` set for the
    latter two, `draft` set for the first."""
    graph = _get_graph()
    initial: OutreachState = {
        "customer": customer,
        "compute_drivers": compute_drivers,
        "already_drafted_ids": already_drafted_ids,
    }
    return graph.invoke(initial)
