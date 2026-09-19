"""
Ties providers.py and prompts.py together: takes a customer_id + SHAP
explanation (human-readable top drivers) and returns a drafted outreach
email -- subject, body, and a CTA button phrase -- plus which provider
generated it.

The LLM writes only labelled parts (SUBJECT, SIGNAL, ACTIONS, QUESTION, CTA;
see prompts.SYSTEM_PROMPT). The email itself is assembled here, in code, so
every draft has the same layout: greeting, one signal sentence, "Here's how we
can help" bullets, one question, a closing line and a sign-off. The greeting
and sign-off are deliberately not the model's to write -- letting it invent a
sender's name or job title would be fabricating a person who doesn't exist.
There is no real contact name to greet the customer by either: the schema has
no name field, and name-like columns are dropped before modelling (see
dataset_routes._IDENTITY_TOKENS), so the greeting is a plain "Hello,".
"""
import logging
import re
from typing import List, Optional, Tuple

from ..api import recommendations, schema
from . import prompts, providers

logger = logging.getLogger(__name__)

GREETING = "Hello,"
CLOSING_LINE = "We're here to help."
DEFAULT_SIGNATURE = "Best regards,"
MAX_ACTIONS = 3

TEMPLATE_QUESTION = "Would you like to schedule a quick call to go over this?"
TEMPLATE_CTA = "Schedule a quick call"
_TEMPLATE_NO_ACTION = "Go through your account with you and answer any questions"

# Customer-facing wording per recommendation category (api/recommendations.py):
# the recommendation's own text is written for the team, not the customer.
# Nothing here asserts more than the data does -- no "recent activity", no
# time frames, no usage claims.
_TEMPLATE_ACTIONS = {
    "contract": "Talk through a longer-term plan that could suit you better, including added value for making that move",
    "onboarding": "Answer any questions and help you get the most out of your account",
    "pricing": "Review whether your current plan matches how you actually use it, and talk through pricing or packaging options",
    "billing": "Make sure paying for your account is smooth, and help you switch to a payment option that works better if it isn't",
    "product-fit": "Confirm your current plan is the best fit, and walk you through the alternatives if it isn't",
}
_TEMPLATE_SUBJECTS = {
    "contract": "A longer-term option for your {value} plan",
    "onboarding": "Getting the most out of your account",
    "pricing": "Making sure your plan fits how you use it",
    "billing": "Making billing easier for you",
    "product-fit": "Is your current plan the right fit?",
}

_KEY_BY_LABEL = {label: key for key, label in schema.FIELD_LABELS.items()}

_RESPONSE_PATTERN = re.compile(
    r"SUBJECT:\s*(?P<subject>.*?)\s*\n+SIGNAL:\s*(?P<signal>.*?)\s*\n+ACTIONS:\s*(?P<actions>.*?)\s*\n+"
    r"QUESTION:\s*(?P<question>.*?)\s*\n+CTA:\s*(?P<cta>.*)",
    re.DOTALL | re.IGNORECASE,
)
_BULLET_MARKER = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s*")


def _feature_key(display_name: str) -> str:
    return _KEY_BY_LABEL.get(display_name) or display_name.lower().replace(" ", "_")


def _short_value(value) -> Optional[str]:
    text = str(value).strip().lower()
    return text if 0 < len(text) <= 20 else None


def _recommended_actions(customer_id: str, drivers: List[dict]) -> List[dict]:
    """The recommendations the Recommendations page shows for this account,
    most important first, so the email proposes the same steps the team
    already saw. That rule table matches on raw column keys, while outreach
    drivers carry display names, so map them back first. Each recommendation
    comes from one risk-raising driver, in order, so they pair up by position.
    Two drivers can map to the same rule (monthly and total charges both
    suggest a pricing review); that step is only proposed once."""
    keyed = [{**d, "feature": _feature_key(d["feature"])} for d in drivers]
    recs = recommendations.build_recommendations(customer_id, keyed)
    increasing = [d for d in drivers if d.get("shap_value", 0) > 0]
    actions, seen = [], set()
    for rec, driver in zip(recs, increasing):
        if rec["category"] != "engagement":
            if rec["category"] in seen:
                continue
            seen.add(rec["category"])
        actions.append({
            "title": rec["title"],
            "suggestedAction": rec["suggestedAction"],
            "category": rec["category"],
            "feature": driver["feature"],
            "value": driver["value"],
        })
    return actions[:MAX_ACTIONS]


def _signature(organization_name: Optional[str]) -> str:
    """Signs with the signed-in user's organization name (db.models.User.company)
    on the line after the closing. For a CRM import or an anonymous session
    there is no real organization name to use, so the closing stands alone --
    nothing is invented in its place."""
    name = (organization_name or "").strip()
    return f"{DEFAULT_SIGNATURE}\n{name}" if name else DEFAULT_SIGNATURE


def _clean(text: str) -> str:
    return text.replace("**", "").strip().strip('"').strip()


def _parse_response(text: str) -> Optional[Tuple[str, str, List[str], str, str]]:
    """Splits the model's labelled reply into (subject, signal, actions,
    question, cta). Returns None when the reply doesn't contain a usable
    signal, at least one action and a question, so the caller falls back to
    the template rather than assembling a broken email. A missing subject or
    CTA is left empty for the caller to fill in."""
    match = _RESPONSE_PATTERN.search(text)
    if not match:
        return None
    actions = [
        _clean(_BULLET_MARKER.sub("", line))
        for line in match.group("actions").splitlines()
        if line.strip()
    ]
    actions = [a for a in actions if a][:MAX_ACTIONS]
    signal, question = _clean(match.group("signal")), _clean(match.group("question"))
    if not (signal and actions and question):
        return None
    return _clean(match.group("subject")), signal, actions, question, _clean(match.group("cta"))


def _signal_phrase(feature: str, value) -> Optional[str]:
    """A customer-friendly clause for the few factors that read naturally to
    a customer. Money amounts (no currency is given) and payment method are
    deliberately never quoted."""
    key, short = _feature_key(feature), _short_value(value)
    if key == "contract_type" and short:
        return f"you're on a {short} contract"
    if key == "service_tier" and short:
        return f"you're on our {short} tier"
    if key == "tenure" and short:
        return f"you've been a customer for {short} months"
    return None


def _build_template_parts(actions: List[dict]) -> Tuple[str, str, List[str], str, str]:
    """Deterministic fallback used when every configured LLM provider fails
    (rate limit, quota exhaustion, no key configured, network down), or when a
    reply can't be parsed. Built only from the account's real recommendations
    and factor values -- same honesty constraint the LLM prompt follows -- and
    specific to that account rather than one shared subject, so a provider
    outage doesn't turn the whole Outreach queue into identical drafts. This
    is a real, recurring failure mode for a free-tier API key, not an edge
    case. Returns (subject, signal, actions, question, cta)."""
    phrases = [p for a in actions if (p := _signal_phrase(a["feature"], a["value"]))][:2]
    signal = (
        f"We noticed {' and '.join(phrases)}."
        if phrases
        else "We'd like to make sure your account is working well for you."
    )
    bullets = [
        _TEMPLATE_ACTIONS.get(a["category"])
        or f"Go through your account's {a['feature'].lower()} with you and see how we can help"
        for a in actions
    ] or [_TEMPLATE_NO_ACTION]

    if not actions:
        subject = "How we can support your account"
    elif actions[0]["category"] in _TEMPLATE_SUBJECTS:
        subject = _TEMPLATE_SUBJECTS[actions[0]["category"]].format(
            value=_short_value(actions[0]["value"]) or "current"
        )
    else:
        subject = f"About your {actions[0]['feature'].lower()}"
    return subject, signal, bullets, TEMPLATE_QUESTION, TEMPLATE_CTA


def _assemble_body(signal: str, actions: List[str], question: str, signature: str) -> str:
    bullets = "\n".join(f"• {a}" for a in actions)
    return (
        f"{GREETING}\n\n{signal}\n\nHere's how we can help:\n{bullets}\n\n"
        f"{question}\n\n{CLOSING_LINE}\n\n{signature}"
    )


def generate_outreach_message(
    customer_id: str, risk_score: float, drivers: List[dict], organization_name: str = None
) -> dict:
    """`organization_name` signs the email (see _signature).

    If every configured LLM provider fails, falls back to a deterministic
    template (see _build_template_parts) rather than raising -- a third-party
    provider being rate-limited or unconfigured should degrade the outreach
    queue's quality, not silently empty it out. The returned `provider` is
    "template" in that case, so callers can label the draft honestly instead
    of implying it was AI-written."""
    actions_in = _recommended_actions(customer_id, drivers)
    messages = prompts.build_messages(customer_id, risk_score, drivers, actions_in)
    subject, signal, actions, question, cta = _build_template_parts(actions_in)
    provider = "template"
    try:
        text, llm_provider = providers.invoke_with_fallback(messages)
    except RuntimeError:
        pass
    else:
        parsed = _parse_response(text)
        if parsed:
            p_subject, signal, actions, question, p_cta = parsed
            subject, cta, provider = p_subject or subject, p_cta or cta, llm_provider
        else:
            logger.warning("Outreach reply from %s wasn't in the expected format; used the template", llm_provider)
    body = _assemble_body(signal, actions, question, _signature(organization_name))
    return {"customer_id": customer_id, "subject": subject, "message": body, "cta": cta, "provider": provider}
