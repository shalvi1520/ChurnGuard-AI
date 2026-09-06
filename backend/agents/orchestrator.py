"""
LangGraph StateGraph wiring prediction_agent -> explainability_agent ->
outreach_agent in sequence, with a conditional edge that SKIPS
outreach_agent entirely for below-threshold customers (a real graph
branch, not a call that returns early inside the node).

Entry point: run_pipeline(customer_id, raw_features, pipeline_type).
"""
from typing import Any, Dict, List, Literal, Optional, TypedDict

from langgraph.graph import END, StateGraph

from . import explainability_agent, outreach_agent, prediction_agent


class PipelineState(TypedDict, total=False):
    customer_id: str
    pipeline_type: Literal["telco", "generic"]
    raw_features: Dict[str, Any]
    risk_score: float
    churn_prediction: int
    threshold: float
    drivers: List[dict]
    outreach: Optional[dict]


def _prediction_node(state: PipelineState) -> dict:
    result = prediction_agent.run(state["customer_id"], state["raw_features"], state["pipeline_type"])
    return {
        "risk_score": result["risk_score"],
        "churn_prediction": result["churn_prediction"],
        "threshold": result["threshold"],
    }


def _explainability_node(state: PipelineState) -> dict:
    drivers = explainability_agent.run(state["raw_features"], state["pipeline_type"])
    return {"drivers": drivers}


def _outreach_node(state: PipelineState) -> dict:
    outreach = outreach_agent.run(
        state["customer_id"], state["risk_score"], state["threshold"], state["drivers"]
    )
    return {"outreach": outreach}


def _route_after_explainability(state: PipelineState) -> str:
    return "outreach" if state["risk_score"] >= state["threshold"] else "skip"


def _build_graph():
    graph = StateGraph(PipelineState)
    graph.add_node("prediction", _prediction_node)
    graph.add_node("explainability", _explainability_node)
    graph.add_node("outreach", _outreach_node)

    graph.set_entry_point("prediction")
    graph.add_edge("prediction", "explainability")
    graph.add_conditional_edges(
        "explainability",
        _route_after_explainability,
        {"outreach": "outreach", "skip": END},
    )
    graph.add_edge("outreach", END)
    return graph.compile()


_compiled_graph = None


def _get_graph():
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = _build_graph()
    return _compiled_graph


def run_pipeline(customer_id: str, raw_features: dict, pipeline_type: str = "telco") -> dict:
    graph = _get_graph()
    initial_state: PipelineState = {
        "customer_id": customer_id,
        "pipeline_type": pipeline_type,
        "raw_features": raw_features,
    }
    final_state = graph.invoke(initial_state)
    return dict(final_state)
