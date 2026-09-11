"""
Validates an LLM-drafted outreach message before it's queued for human
review -- the "Validation" step in the agentic outreach flow
(backend/agents/outreach_workflow.py). Catches the failure modes an LLM can
produce (empty output, an unauthorized promise) so a broken or over-promising
draft never reaches a human's review queue looking like a normal one.
"""
from typing import Optional, Tuple

MIN_BODY_LENGTH = 20

# Concessions nothing in this app is authorized to offer. llm/prompts.py's
# SYSTEM_PROMPT already instructs the model not to promise these -- this is
# the backstop for when it does anyway, not the only line of defense.
FORBIDDEN_PHRASES = [
    "free forever", "lifetime discount", "guaranteed refund", "100% refund",
    "money back guarantee", "free upgrade for life", "permanently free",
    "unlimited free", "never pay again",
]


def validate_draft(body: str) -> Tuple[bool, Optional[str]]:
    """Returns (valid, reason_if_not)."""
    if not body or len(body.strip()) < MIN_BODY_LENGTH:
        return False, "the draft was empty or too short to be usable"
    lowered = body.lower()
    for phrase in FORBIDDEN_PHRASES:
        if phrase in lowered:
            return False, f'the draft contained an unauthorized promise ("{phrase}")'
    return True, None
