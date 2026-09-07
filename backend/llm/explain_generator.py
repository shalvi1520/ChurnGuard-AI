"""
Ties providers.py and prompts.py together for the explanation summary --
structural sibling of outreach_generator.py. Takes a customer_id + churn
risk + real SHAP driver breakdown and returns an LLM-written plain-English
paragraph, plus which provider generated it.
"""
from typing import List

from . import prompts, providers


def generate_explanation_summary(customer_id: str, risk_score: float, drivers: List[dict]) -> dict:
    messages = prompts.build_explain_messages(customer_id, risk_score, drivers)
    text, provider = providers.invoke_with_fallback(messages)
    return {"customer_id": customer_id, "summary": text, "provider": provider}
