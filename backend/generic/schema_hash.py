"""
Identifies a dataset by the *shape* of the features it will train on --
which ChurnGuard fields are present, not their actual values. Deliberately
the opposite of fingerprint.py's content hash: two different companies'
exports with the same columns populated hash identically here, so a model
trained on one can be offered as a reuse candidate for the other when no
label is available to train a new one (see artifact_registry.py,
dataset_routes.py's resolve_training_eligibility()).

The target/churn field is never part of this hash -- whether a dataset has
a churn column or not must not change its schema hash, since the whole
point is recognising "this is the same shape of data" across a labeled
training run and a later unlabeled connect of the same feed.

Granularity decision (see churnguard_generalization_fix_prompt.md's open
question): hashed on the *exact* resolved feature-field set that will
actually become `feature_columns` -- required + present-optional +
whatever extra/vertical-specific columns get used -- not "required fields
only". generic/predictor.py's preprocess() has no graceful fallback for a
feature column that's entirely missing from incoming data, so a coarser
hash (required-only) could match a REUSE_MODEL candidate whose saved
feature_columns don't structurally fit what's about to be fed to it. Applied
consistently wherever a schema hash is computed (dataset_routes.py, tests).
"""
import hashlib
from typing import Iterable, Optional


def compute_schema_hash(resolved_fields: Iterable[str], client_id: Optional[str] = None) -> str:
    """`resolved_fields` is the full list of feature column keys (ChurnGuard
    fields + extras) that will be handed to the trainer -- NEVER include
    'churn' itself. `client_id` is optional multi-tenant scoping (unused
    today -- dataset_routes.py passes None; kept as a parameter so a future
    per-account registry doesn't need a signature change)."""
    fields = sorted(f for f in set(resolved_fields) if f != "churn")
    raw = "|".join(fields) + f"|client={client_id or ''}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
