"""
Ties providers.py and prompts.py together: takes a customer_id + SHAP
explanation (human-readable top drivers) and returns a drafted outreach
message plus which provider generated it.
"""
from typing import List

from . import prompts, providers


def generate_outreach_message(customer_id: str, risk_score: float, drivers: List[dict]) -> dict:
    messages = prompts.build_messages(customer_id, risk_score, drivers)
    text, provider = providers.invoke_with_fallback(messages)
    return {"customer_id": customer_id, "message": text, "provider": provider}
