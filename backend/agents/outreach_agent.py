"""
Thin wrapper around llm/outreach_generator.py. The orchestrator's
conditional LangGraph edge is what actually skips this agent for
below-threshold customers (a real skip, not a call that returns early) --
this module still guards independently so it never drafts outreach for a
low-risk customer even if called directly outside the graph.
"""
from typing import List

from ..llm import outreach_generator


def run(customer_id: str, risk_score: float, threshold: float, drivers: List[dict]) -> dict:
    if risk_score < threshold:
        raise ValueError(
            f"outreach_agent should not run for a below-threshold customer "
            f"(risk_score={risk_score}, threshold={threshold})."
        )
    return outreach_generator.generate_outreach_message(customer_id, risk_score, drivers)
