"""
Prompt templates for LLM-drafted retention outreach messages. The system
prompt constrains the model to only reference the SHAP-derived drivers
it's given -- it must never invent or speculate about other reasons.
"""
from typing import List

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage

SYSTEM_PROMPT = (
    "You are a customer retention specialist drafting a short outreach email for "
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
    "- Do not invent a sender's name, job title or company name, and do not write "
    "a greeting or a sign-off -- the application adds its own, consistent greeting "
    "and signature. Write only the subject line and the body's core message.\n"
    "- Keep the body short: 2-4 sentences. Warm and professional in tone. Reference "
    "1-2 of the most significant factors in plain language, and offer a concrete "
    "next step or way to help.\n"
    "- The subject line must be specific to this account's actual situation, under "
    "60 characters, no clickbait, no exclamation marks, no emoji.\n\n"
    "Respond in exactly this format and nothing else -- no markdown, no extra "
    "commentary before or after:\n"
    "SUBJECT: <the subject line>\n"
    "BODY: <the message body>"
)

USER_PROMPT_TEMPLATE = (
    "Predicted churn risk: {risk_score:.0%}\n"
    "Top factors driving this risk (most significant first):\n"
    "{driver_lines}\n\n"
    "Draft the subject and body for this account's retention outreach email."
)


def format_driver_lines(drivers: List[dict]) -> str:
    lines = []
    for d in drivers:
        direction = "increases" if d["shap_value"] > 0 else "decreases"
        lines.append(f"- {d['feature']} = {d['value']} ({direction} churn risk)")
    return "\n".join(lines)


def build_messages(customer_id: str, risk_score: float, drivers: List[dict]) -> List[BaseMessage]:
    # customer_id is accepted for a consistent call signature across
    # prompts.py's build_*_messages functions, but deliberately left out of
    # the prompt text itself: it's an internal identifier (e.g. "CUST-0046"),
    # not something that should shape the email's wording -- putting it in
    # the prompt was exactly what caused drafts to open with "Hi CUST-0046,".
    user_content = USER_PROMPT_TEMPLATE.format(
        risk_score=risk_score,
        driver_lines=format_driver_lines(drivers),
    )
    return [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=user_content)]


EXPLAIN_SYSTEM_PROMPT = (
    "You are a churn-analytics assistant writing a plain-English summary of why a "
    "machine learning model scored one customer as it did. You will be given the "
    "customer's predicted churn probability and the top factors driving that "
    "score, derived from a real SHAP explanation of the model's prediction.\n\n"
    "Rules:\n"
    "- Reference ONLY the factors provided to you. Do not invent, assume, or "
    "speculate about any other reason the customer might be at risk.\n"
    "- Do not mention SHAP, KernelExplainer, or other technical/statistical "
    "implementation terms -- write for a customer success manager, not a data "
    "scientist.\n"
    "- Be specific about the factor values you were given.\n"
    "- 3-5 sentences, factual and direct."
)

EXPLAIN_USER_PROMPT_TEMPLATE = (
    "Customer ID: {customer_id}\n"
    "Predicted churn risk: {risk_score:.0%}\n"
    "Top factors, most significant first (positive effect = pushes risk up, "
    "negative = pulls risk down):\n"
    "{driver_lines}\n\n"
    "Write the plain-English summary."
)


def format_explain_driver_lines(drivers: List[dict]) -> str:
    lines = []
    for d in drivers:
        direction = "increases" if d["contribution"] > 0 else "decreases"
        lines.append(f"- {d['feature']} = {d['value']}: {direction} risk by {abs(d['contribution']):.2f}")
    return "\n".join(lines)


def build_explain_messages(customer_id: str, risk_score: float, drivers: List[dict]) -> List[BaseMessage]:
    user_content = EXPLAIN_USER_PROMPT_TEMPLATE.format(
        customer_id=customer_id,
        risk_score=risk_score / 100 if risk_score > 1 else risk_score,
        driver_lines=format_explain_driver_lines(drivers),
    )
    return [SystemMessage(content=EXPLAIN_SYSTEM_PROMPT), HumanMessage(content=user_content)]


# Used only when the deterministic matcher in backend/api/mapping.py couldn't
# confidently resolve a REQUIRED field on its own -- see dataset_routes.py's
# POST /datasets/{id}/suggest-mapping. Never called for every column, only on
# explicit request for one still-ambiguous field.
MAPPING_SYSTEM_PROMPT = (
    "You are a data-mapping assistant helping match one column in a customer "
    "dataset to a field a churn-prediction system needs. You will be given the "
    "field's description and a list of candidate columns from the user's file, "
    "each with a few real example values.\n\n"
    "Rules:\n"
    "- Pick at most ONE candidate column that best matches the field.\n"
    "- If none of the candidates plausibly hold this field's data, return "
    'column: null -- do not force a weak match onto a wrong column.\n'
    "- Base your answer only on the column names and example values given. "
    "Never invent or reference a column that was not listed.\n"
    "- Respond with ONLY a JSON object and nothing else -- no markdown fence, "
    "no explanation outside the JSON:\n"
    '{"column": "<exact candidate name or null>", "confidence": <0.0 to 1.0>, '
    '"reasoning": "<one short sentence>"}'
)

MAPPING_USER_PROMPT_TEMPLATE = (
    "Field needed: {label}\n"
    "Description: {description}\n"
    "Why it matters: {why_needed}\n"
    "What to look for: {look_for}\n\n"
    "Candidate columns (name: example values):\n{candidate_lines}\n\n"
    "Which candidate column, if any, holds this field's data?"
)


def format_mapping_candidates(candidates: List[dict]) -> str:
    lines = []
    for c in candidates:
        samples = ", ".join(str(s) for s in c.get("samples", []))
        lines.append(f'- "{c["name"]}": {samples}' if samples else f'- "{c["name"]}" (no sample values)')
    return "\n".join(lines)


def build_mapping_messages(field: dict, candidates: List[dict]) -> List[BaseMessage]:
    user_content = MAPPING_USER_PROMPT_TEMPLATE.format(
        label=field["label"],
        description=field["description"],
        why_needed=field.get("whyNeeded", ""),
        look_for=field.get("lookFor", ""),
        candidate_lines=format_mapping_candidates(candidates),
    )
    return [SystemMessage(content=MAPPING_SYSTEM_PROMPT), HumanMessage(content=user_content)]
