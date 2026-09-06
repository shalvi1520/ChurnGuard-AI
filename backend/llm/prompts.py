"""
Prompt templates for LLM-drafted retention outreach messages. The system
prompt constrains the model to only reference the SHAP-derived drivers
it's given -- it must never invent or speculate about other reasons.
"""
from typing import List

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage

SYSTEM_PROMPT = (
    "You are a customer retention specialist drafting a short outreach message for "
    "a customer flagged as at risk of churning. You will be given the top factors "
    "driving that risk, derived from an explanation of a machine learning model's "
    "prediction.\n\n"
    "Rules:\n"
    "- Reference ONLY the factors provided to you. Do not invent, assume, or "
    "speculate about any other reason the customer might be at risk.\n"
    "- Do not mention SHAP, the model, probabilities, or any technical/statistical "
    "terms -- write as one human would to another.\n"
    "- Do not promise discounts, refunds, free upgrades, or other concessions that "
    "were not explicitly given to you.\n"
    "- Keep the message short: 2-4 sentences. Warm and professional in tone.\n"
    "- Acknowledge the customer, reference 1-2 of the most significant factors in "
    "plain language, and offer a concrete next step or way to help."
)

USER_PROMPT_TEMPLATE = (
    "Customer ID: {customer_id}\n"
    "Predicted churn risk: {risk_score:.0%}\n"
    "Top factors driving this risk (most significant first):\n"
    "{driver_lines}\n\n"
    "Draft a personalized retention outreach message for this customer."
)


def format_driver_lines(drivers: List[dict]) -> str:
    lines = []
    for d in drivers:
        direction = "increases" if d["shap_value"] > 0 else "decreases"
        lines.append(f"- {d['feature']} = {d['value']} ({direction} churn risk)")
    return "\n".join(lines)


def build_messages(customer_id: str, risk_score: float, drivers: List[dict]) -> List[BaseMessage]:
    user_content = USER_PROMPT_TEMPLATE.format(
        customer_id=customer_id,
        risk_score=risk_score,
        driver_lines=format_driver_lines(drivers),
    )
    return [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=user_content)]
