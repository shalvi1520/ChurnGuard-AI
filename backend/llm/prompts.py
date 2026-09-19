"""
Prompt templates for LLM-drafted retention outreach messages. The system
prompt constrains the model to only reference the SHAP-derived drivers
it's given -- it must never invent or speculate about other reasons.
"""
from typing import List, Optional

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage

SYSTEM_PROMPT = (
    "You are a customer success specialist at a SaaS company, drafting a short, warm, professional "
    "outreach email to one customer. A human on the team reviews and edits every draft before "
    "anything is sent. You will be given real facts about this account -- the factors that most "
    "affect their retention and the specific steps the team has already decided on -- and you must "
    "write from those facts and nothing else.\n\n"
    "You write four parts of the email; the application adds the greeting, the closing line and "
    "the sign-off itself:\n"
    "1. SIGNAL: ONE sentence naming the specific, real reason you are writing -- one or two of the "
    "given factors in plain customer-friendly words, stating each value exactly as given (for "
    "example, 'Contract type = Free' becomes 'you're on our free plan'). Choose the factors that "
    "read most naturally to a customer, and skip any that would feel intrusive or odd to raise "
    "(payment method, personal attributes).\n"
    "2. ACTIONS: the concrete things the team will do to help, one bullet per distinct recommended "
    "step you were given (most important first), in customer-facing words. Use 1 to 3 bullets: add "
    "a second or third only when it is a genuinely different, real step from the list -- never "
    "pad. Frame each as something to go through together, never as a done deal, and tie a step to "
    "the real value of the factor it is about. If no steps were given, write a single bullet "
    "offering to go through the account and answer questions.\n"
    "3. QUESTION: exactly ONE closing question the customer can answer with a yes or a short reply "
    "(for example, whether they would like to schedule a quick call to go over this). Not an "
    "open-ended sentiment.\n"
    "4. CTA: a short button phrase, 2-5 words, action-first, restating what the question asks (for "
    "example 'Schedule a quick call'). Never invent an offer, discount or feature.\n\n"
    "Rules:\n"
    "- Use ONLY the facts provided. Do not invent, assume or speculate about anything else about "
    "this customer: no time frames ('recently', 'so far', 'last month'), no ticket status ('open', "
    "'unresolved'), no usage, product features, past conversations, feelings, causes, dates or "
    "company details. State a value plainly ('1 support ticket on your account') without wrapping "
    "a story around it. Every action must trace back to a step and factor you were given.\n"
    "- Do not combine two factors into a claim neither one makes. For example, tenure is how long "
    "they have been a customer, not how long they have been on a particular plan or tier -- state "
    "each in its own sentence or leave one out.\n"
    "- The question must not name a date or time frame ('next week', 'tomorrow', 'this Friday'); "
    "leave scheduling open. A bare number with no unit or currency (such as a charge) must not be "
    "given a currency symbol or unit that was not provided -- quote it as given or leave it out.\n"
    "- Never quote a risk score or percentage, and never say the customer is 'at risk', 'likely "
    "to leave' or 'churn'. Do not mention SHAP, the model, predictions, or any technical or "
    "statistical term.\n"
    "- Do not state any price, discount amount, percentage, free item or deadline -- none were "
    "given to you. If a step involves an incentive or added value you may say you would like to "
    "discuss one, but never what it is.\n"
    "- Do not invent a sender's name, job title or company name. Do not write a greeting, a line "
    "such as 'We're here to help', or a sign-off. Speak as 'we' / 'our team'.\n"
    "- Keep it concise and human -- a real product team that wants to help, not a form letter and "
    "not a sales pitch. Each bullet is one short line. Avoid filler and open-ended sentiment of any "
    "kind, such as 'I hope this finds you well', anything about hearing or talking through 'how "
    "things are going', or 'explore ways to help you get more value'.\n"
    "- Subject: specific to THIS account's situation, drawing on the top factor or the first "
    "step; under 60 characters; no exclamation marks, no emoji, no customer ID; and never "
    "'checking in', 'touching base' or 'quick check-in'.\n\n"
    "Respond in exactly this format and nothing else -- plain text, no markdown, no commentary "
    "before or after:\n"
    "SUBJECT: <the subject line>\n"
    "SIGNAL: <one sentence>\n"
    "ACTIONS:\n"
    "- <first action>\n"
    "- <second action, only if it is genuinely distinct>\n"
    "QUESTION: <one question>\n"
    "CTA: <the button text>"
)
USER_PROMPT_TEMPLATE = (
    "Account context, for calibrating tone only -- never quote it: predicted churn risk "
    "{risk_score:.0%}\n"
    "Factors affecting this account, most significant first:\n"
    "{driver_lines}\n\n"
    "Recommended steps already decided for this account, most important first:\n"
    "{step_lines}\n\n"
    "Write the SUBJECT, SIGNAL, ACTIONS, QUESTION and CTA for this account's retention outreach email."
)
NO_RECOMMENDED_STEPS = "- none given -- offer a conversation only, no concessions."


def format_driver_lines(drivers: List[dict]) -> str:
    lines = []
    for d in drivers:
        direction = "increases" if d["shap_value"] > 0 else "decreases"
        lines.append(f"- {d['feature']} = {d['value']} ({direction} churn risk)")
    return "\n".join(lines)


def format_step_lines(recommended_actions: Optional[List[dict]]) -> str:
    if not recommended_actions:
        return NO_RECOMMENDED_STEPS
    return "\n".join(
        f"- {a['title']} -- {a['suggestedAction']} (about: {a['feature']} = {a['value']})"
        for a in recommended_actions
    )


def build_messages(
    customer_id: str,
    risk_score: float,
    drivers: List[dict],
    recommended_actions: Optional[List[dict]] = None,
) -> List[BaseMessage]:
    # customer_id is accepted for a consistent call signature across
    # prompts.py's build_*_messages functions, but deliberately left out of
    # the prompt text itself: it's an internal identifier (e.g. "CUST-0046"),
    # not something that should shape the email's wording -- putting it in
    # the prompt was exactly what caused drafts to open with "Hi CUST-0046,".
    user_content = USER_PROMPT_TEMPLATE.format(
        risk_score=risk_score,
        driver_lines=format_driver_lines(drivers),
        step_lines=format_step_lines(recommended_actions),
    )
    return [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=user_content)]


EXPLAIN_SYSTEM_PROMPT = (
    "You are a churn-analytics assistant writing a plain-English explanation of why a "
    "machine learning model scored one customer as it did, for a customer success or "
    "retention manager who will act on it. You will be given the customer's predicted "
    "churn probability, the model's baseline risk (its typical prediction before this "
    "account's own factors are applied), and the top factors driving this account's "
    "score -- derived from a real SHAP explanation of the model's prediction, given to "
    "you most significant first.\n\n"
    "Write flowing prose (no headings, no bullet points, no markdown) that does exactly "
    "three things, in this order:\n"
    "1. Open with the risk verdict: state the churn probability plainly and say how it "
    "compares to the baseline (e.g. how many points above or below typical), so the "
    "reader immediately knows whether this is an ordinary case or an unusual one.\n"
    "2. Walk through the top 3-4 factors you were given, in the SAME order they were "
    "given. For each, go beyond restating that it raises or lowers risk -- give the "
    "plain business reason that connects the factor's value to the outcome (for "
    "example, why a lower-commitment plan tends to correlate with higher churn -- lower "
    "switching cost, less investment in the relationship -- or why long tenure tends to "
    "be protective).\n"
    "3. Close with exactly ONE concrete, actionable insight or pattern this account's "
    "particular combination of factors points to -- something a retention manager could "
    "actually do or watch for, not a restatement of the numbers already given.\n\n"
    "Rules:\n"
    "- Reference ONLY the factors and numbers provided to you. Do not invent, assume, or "
    "speculate about any fact about this specific customer beyond what's given here -- "
    "no guessing at their industry, usage patterns, support history, or anything else "
    "not stated.\n"
    "- Your business reasoning in step 2 must stay general and plausible -- why a factor "
    "like this commonly relates to churn -- never a specific claim about what this "
    "customer personally did, thought, said, or experienced.\n"
    "- Do not mention SHAP, KernelExplainer, base values, or other technical/statistical "
    "implementation terms -- write for a customer success manager, not a data scientist.\n"
    "- Be specific about the factor values you were given, not vague ('several factors').\n"
    "- Concise: 4-6 sentences total. A shorter, sharper explanation beats a longer, "
    "padded one -- never add filler just to reach a length."
)

EXPLAIN_USER_PROMPT_TEMPLATE = (
    "Customer ID: {customer_id}\n"
    "Predicted churn risk: {risk_score:.0%}\n"
    "Model baseline risk (before this account's own factors): {baseline_risk:.0%}\n"
    "Top factors, most significant first (positive effect = pushes risk up, "
    "negative = pulls risk down):\n"
    "{driver_lines}\n\n"
    "Write the plain-English explanation."
)


def format_explain_driver_lines(drivers: List[dict]) -> str:
    lines = []
    for d in drivers:
        direction = "increases" if d["contribution"] > 0 else "decreases"
        lines.append(f"- {d['feature']} = {d['value']}: {direction} risk by {abs(d['contribution']):.2f}")
    return "\n".join(lines)


def build_explain_messages(
    customer_id: str, risk_score: float, baseline_risk: float, drivers: List[dict]
) -> List[BaseMessage]:
    user_content = EXPLAIN_USER_PROMPT_TEMPLATE.format(
        customer_id=customer_id,
        risk_score=risk_score / 100 if risk_score > 1 else risk_score,
        baseline_risk=baseline_risk / 100 if baseline_risk > 1 else baseline_risk,
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
