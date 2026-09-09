"""
Eligibility rules for the automatic post-training outreach pipeline
(backend/agents/outreach_workflow.py). Deliberately small and hardcoded for
now, not a config system -- a real per-vertical business-rule configuration
(contact frequency across sessions, allowed offers, eligibility beyond risk
tier) is future work. This is the honest minimum: a risk threshold, so
low/medium-risk accounts are never drafted for automatically, and a cap on
how many drafts one training run produces, so a 50,000-row dataset doesn't
trigger 50,000 LLM calls in the background.
"""
from typing import Optional, Set, Tuple

RISK_TIER_ORDER = {"low": 0, "medium": 1, "high": 2, "critical": 3}

# Only these tiers get an automatic draft. A customer below this can still
# get one on demand (the existing "Draft outreach" button on their page) --
# this threshold only governs what happens with no one asking.
MIN_RISK_TIER_FOR_AUTO_OUTREACH = "high"

# Bounds the background run's total LLM cost/time regardless of dataset
# size. The worst-risk customers are drafted first (see outreach_workflow's
# caller), so a dataset with more eligible accounts than this still gets the
# ones that matter most drafted.
MAX_AUTO_DRAFTS_PER_RUN = 30


def is_eligible_for_auto_outreach(customer: dict, already_drafted_ids: Set[str]) -> Tuple[bool, Optional[str]]:
    """Returns (eligible, reason_if_not) -- the reason is shown nowhere
    prominent today, but exists so a future review UI or log can say *why*
    an account was skipped rather than just that it was."""
    if customer["id"] in already_drafted_ids:
        return False, "a draft already exists for this account"
    tier = customer.get("riskTier", "low")
    if RISK_TIER_ORDER.get(tier, 0) < RISK_TIER_ORDER[MIN_RISK_TIER_FOR_AUTO_OUTREACH]:
        return False, f"risk tier ({tier}) is below the threshold for automatic outreach ({MIN_RISK_TIER_FOR_AUTO_OUTREACH})"
    return True, None
