"""
Ties providers.py and prompts.py together: takes a customer_id + SHAP
explanation (human-readable top drivers) and returns a drafted outreach
email -- subject and body -- plus which provider generated it.

The LLM writes only the subject line and the body's core message (see
prompts.SYSTEM_PROMPT); the greeting and signature are appended here, in
code, deliberately -- letting the model invent a sender's name or job title
would be fabricating a person who doesn't exist, and there is no real
contact name in the connected dataset to greet the customer by (see
shared/churnguardFields.json), so every draft opens the same honest way.
"""
import re
from typing import List, Tuple

from . import prompts, providers

DEFAULT_SUBJECT = "A quick check-in about your account"
GREETING = "Hi there,"
SIGNATURE = "Best regards,\nThe Customer Success Team"

_RESPONSE_PATTERN = re.compile(r"SUBJECT:\s*(.*?)\s*\n+BODY:\s*(.*)", re.DOTALL | re.IGNORECASE)


def _parse_response(text: str) -> Tuple[str, str]:
    """Splits the model's `SUBJECT: ... BODY: ...` response. Falls back to
    treating the whole response as the body rather than losing a draft
    outright if the model didn't follow the format exactly."""
    match = _RESPONSE_PATTERN.search(text)
    if not match:
        return DEFAULT_SUBJECT, text.strip()
    subject = match.group(1).strip().strip('"')
    body = match.group(2).strip()
    return (subject or DEFAULT_SUBJECT), (body or text.strip())


def generate_outreach_message(customer_id: str, risk_score: float, drivers: List[dict]) -> dict:
    messages = prompts.build_messages(customer_id, risk_score, drivers)
    text, provider = providers.invoke_with_fallback(messages)
    subject, body_core = _parse_response(text)
    body = f"{GREETING}\n\n{body_core}\n\n{SIGNATURE}"
    return {"customer_id": customer_id, "subject": subject, "message": body, "provider": provider}
