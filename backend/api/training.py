"""
The seam between "train and score a dataset" and "serve an HTTP request".

run_prediction() used to be both at once: a 370-line FastAPI route that
resolved caches, trained, scored, mutated the in-memory DatasetEntry,
queued background outreach, raised HTTPException throughout, and built a
response. None of that could be called from anywhere but a request.

The scheduled CRM sync (backend/sync/) needs the training half and must not
get the rest: it has no request, no BackgroundTasks, no HTTP layer to raise
into, and -- decided explicitly -- must never mutate whatever dataset a user
currently has open in their session.

So the work splits three ways:

  train_and_score()      pure: caches -> train -> score -> persist. Returns
                         a TrainingResult. Raises domain errors, never
                         HTTPException. Touches no DatasetEntry.
  apply_result_to_entry() the mutation half, for the request path only.
  run_prediction()       the thin HTTP wrapper that composes both.

This module holds the vocabulary that seam needs: the domain exceptions and
the result container. The functions themselves stay in dataset_routes.py,
next to the helpers they lean on.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


class TrainingError(Exception):
    """The data cannot be trained or scored as given, and the caller should
    say so plainly: an unusable churn column, no rows left after cleaning, a
    mapped column missing from the data.

    Carries the message verbatim to preserve what /predict said before this
    was extracted -- these strings name the user's own columns and are the
    most useful thing the UI shows. The route maps this to HTTP 400.
    """


class NeedsDerivedLabel(Exception):
    """No churn column, but derive_label.py found a plausible proxy the user
    could confirm. The route maps this to HTTP 409 -- the frontend is
    expected to have acted on /validate's `eligibility` field long before
    reaching /predict, so this is the defensive path, not the normal one."""


class NoUsableModel(Exception):
    """No churn column, no derivable label, and no existing model whose
    shape fits this data. The honest dead end; HTTP 400."""


@dataclass
class TrainingResult:
    """Everything a caller needs from a training/scoring run, with nothing
    about *how* it should be delivered.

    The request path feeds this to apply_result_to_entry() and then builds a
    JSON response from it; the scheduler writes it to the database and stops
    there. Both read the same fields, so the two paths cannot drift in what
    they consider a completed run.
    """

    fingerprint: str
    report: Dict[str, Any]
    customers: List[Dict[str, Any]]
    raw_features_by_id: Dict[str, Dict[str, Any]]
    top_drivers: List[Dict[str, Any]]
    cleaning: List[Dict[str, Any]]
    extra_columns_used: List[str]
    extra_columns_skipped: List[Dict[str, str]]
    field_to_col: Dict[str, str]
    # 'trained' | 'cached' | 'reused' -- the value /predict reports, kept as
    # a plain string because it is part of the response contract.
    training_source: str
    labelled_churn_count: Optional[int]
    # The response's trainingMetrics block, built by whichever path produced
    # this result. Carried rather than derived: the REUSE_MODEL path reads
    # the registry entry's stored metrics with .get(), while the training
    # paths index report["test_metrics"] directly, and collapsing the two
    # would quietly change what a missing metric does.
    training_metrics: Dict[str, Any] = field(default_factory=dict)
    # High/critical-risk customers eligible for auto-outreach. The request
    # path decides what to do about them; this only counts them.
    eligible_count: int = 0
    # Drafts restored from a previous run for this exact data, or None when
    # nothing was ever persisted. None and [] mean different things: None is
    # "no prior run to restore from", [] is "a prior run produced none".
    restored_drafts: Optional[List[Dict[str, Any]]] = None
    # True when this run must NOT re-queue auto-outreach: a full-result cache
    # hit already has its drafts, and re-queuing would recompute a SHAP
    # explanation per high-risk customer -- the single most expensive step
    # the cache exists to avoid.
    suppress_outreach: bool = False
    # Whether a queued outreach run should be told which user/fingerprint it
    # belongs to, so its drafts get persisted. False on the REUSE_MODEL path,
    # which has always queued outreach without that context -- its drafts
    # belong to a model trained on somebody else's earlier data, and are
    # deliberately not filed against this fingerprint.
    outreach_persist_context: bool = True
    # REUSE_MODEL only: the model came from a different, earlier connect.
    reused_model: Optional[Dict[str, Any]] = field(default=None)
