"""
Persistent tables: who a user is, which datasets they've connected, and
which of those have already been trained -- so reconnecting the same data
doesn't mean paying for another Optuna-tuned stacking fit. The active
dataset's raw rows, customer scores and SHAP caches stay in-memory
(backend/api/store.py); only what should survive a restart lives here.
"""
import datetime
import uuid

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _uuid() -> str:
    return uuid.uuid4().hex


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    # Nullable since OAuth arrived: an account created by signing in with
    # Google has no password at all, and storing a placeholder
    # hash for it would be strictly worse -- it would make such an account
    # look password-capable to every `if user.password_hash` check in the
    # codebase, including the login path. NULL states plainly that this user
    # cannot authenticate by password, and login rejects it as such.
    password_hash: Mapped[str] = mapped_column(String(255), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    company: Mapped[str] = mapped_column(String(255), nullable=True)
    # A disabled account keeps its data and its history but can no longer
    # sign in or hold a session. Checked on every credential path, not just
    # at login, so deactivating someone takes effect on their next request
    # rather than whenever their current session happens to expire.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow
    )
    last_login_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=True)

    datasets: Mapped[list["Dataset"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    oauth_accounts: Mapped[list["OAuthAccount"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    sessions: Mapped[list["UserSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------- auth ------
#
# Everything below backs backend/api/auth_routes.py. Three tables, each for a
# thing a JWT alone could not do:
#
#   oauth_accounts        -- remembers that a provider identity maps
#                            to this local user, keyed by the provider's own
#                            stable subject rather than by email.
#   user_sessions         -- makes sign-out real. A JWT stays valid until it
#                            expires no matter what the server wants; a row
#                            that can be deleted does not.
#   password_reset_tokens -- single-use, expiring, stored only as a hash.
#
# The rule shared by the last two: the value handed to the user (a session
# cookie, a link in an email) is never what is written down. Only its SHA-256
# is stored, so a dump of this database yields nothing that can be replayed
# against the running app.


class OAuthAccount(Base):
    """A provider identity linked to a local user.

    `provider_account_id` is the provider's stable subject claim (`sub`) --
    Google's opaque user id -- never the email. An
    email can be changed at the provider, reassigned within a tenant, or (on
    some providers) go unverified entirely, so matching on it would mean
    anyone able to control a matching address could walk straight into the
    account. The subject is the only identifier the provider promises is
    stable and unique, so it is the only one used for lookup.

    Unique on (provider, provider_account_id) rather than on either alone: the
    same subject string from two different providers is two different people,
    and one user may legitimately link more than one provider.
    """

    __tablename__ = "oauth_accounts"
    __table_args__ = (
        UniqueConstraint("provider", "provider_account_id", name="uq_oauth_provider_account"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # 'google'
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    provider_account_id: Mapped[str] = mapped_column(String(255), nullable=False)
    # The email the provider asserted at link time, kept for display and
    # support ("which Google account is this?") only. Never used for lookup --
    # see the class docstring.
    provider_email: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.datetime.utcnow
    )

    user: Mapped["User"] = relationship(back_populates="oauth_accounts")


class UserSession(Base):
    """One signed-in browser.

    This is what makes logout mean something. The previous design put a
    7-day JWT in localStorage: signing out deleted the client's copy, but the
    token itself stayed valid for the rest of the week, so anything that had
    already captured it kept working and there was no server-side way to stop
    it. A session row can simply be deleted, and the very next request fails.

    `token_hash` is SHA-256 of the opaque token in the cookie, never the token
    itself, for the same reason password_hash is not the password.

    `expires_at` carries the Remember-me decision: the checkbox picks between
    a short browser-session lifetime and a long persistent one, and since the
    server enforces this row's expiry, a tampered-with cookie lifetime on the
    client changes nothing.
    """

    __tablename__ = "user_sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, index=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.datetime.utcnow
    )
    # Which sign-in produced this session: 'password' | 'google'.
    # Reported by /api/auth/me so the UI can say how you are signed in, and
    # useful when a user asks why a password change did not end a session.
    auth_method: Mapped[str] = mapped_column(String(50), nullable=False, default="password")

    user: Mapped["User"] = relationship(back_populates="sessions")


class PasswordResetToken(Base):
    """A single-use, expiring password-reset grant.

    Three properties matter, and each is a column rather than a convention:
    only the hash is stored (`token_hash`), it stops working at a deadline
    (`expires_at`), and it stops working once spent (`used_at`). The row is
    kept after use rather than deleted, so a replayed link can be answered
    with a definite "already used" instead of an ambiguous "unknown token".
    """

    __tablename__ = "password_reset_tokens"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    used_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.datetime.utcnow
    )

    user: Mapped["User"] = relationship()


class Dataset(Base):
    """One upload/connect event. `fingerprint` identifies the data's actual
    content (columns, dtypes, row count, a content hash) so an identical
    re-upload can be recognised as the same dataset, not a new one."""

    __tablename__ = "datasets"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    source_kind: Mapped[str] = mapped_column(String(50), nullable=True)
    source_provider: Mapped[str] = mapped_column(String(100), nullable=True)
    row_count: Mapped[int] = mapped_column(Integer, nullable=True)
    column_count: Mapped[int] = mapped_column(Integer, nullable=True)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=True, index=True)
    mappings: Mapped[dict] = mapped_column(JSON, nullable=True)
    uploaded_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="datasets")
    trained_models: Mapped[list["TrainedModel"]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan"
    )


class TrainedModel(Base):
    """A completed training run's result, keyed by the dataset's fingerprint.
    `artifact_dir` points at the fingerprint-scoped folder under
    backend/generic/artifacts/ holding the actual fitted model/scaler/
    encoders/SHAP background -- this row is what lets /predict recognise
    "we've already trained this exact data" and reload instead of retrain."""

    __tablename__ = "trained_models"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    dataset_id: Mapped[str] = mapped_column(String(32), ForeignKey("datasets.id"), nullable=False, index=True)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    artifact_dir: Mapped[str] = mapped_column(String(500), nullable=False)
    report: Mapped[dict] = mapped_column(JSON, nullable=False)
    # Per-customer scores from this run -- full records (id, probability,
    # tier, churned, plus the same feature-column fields the frontend's
    # customer list/dashboard already display). Nullable so existing rows
    # from before this column existed don't need a backfill; a history entry
    # with no predictions still shows its training metrics.
    predictions: Mapped[list] = mapped_column(JSON, nullable=True)
    # Everything else a full /predict response needs that isn't `report` or
    # `predictions`: top_drivers, cleaning actions, extra-column usage, and
    # each customer's raw (pre-encoding) feature values -- the last of these
    # is what lets a later per-customer SHAP explain click work on a fully
    # cache-hit connect without ever having called generic_predictor.predict()
    # or recomputed SHAP for this run. Nullable for the same reason as
    # `predictions`: older rows simply don't support a full-result cache hit
    # and fall back to the narrower training-only cache instead.
    full_result_extra: Mapped[dict] = mapped_column(JSON, nullable=True)
    # Persisted AI-drafted outreach emails for this exact trained result, so
    # a later cache hit on the same fingerprint restores drafts instead of
    # redrafting them (see _persist_outreach_drafts / _load_cached_outreach_drafts
    # in dataset_routes.py). Was previously read/written by that code without
    # ever being declared here -- SQLAlchemy silently dropped every write,
    # since it only persists columns it knows about. Nullable for the same
    # backfill reason as predictions/full_result_extra.
    outreach_drafts: Mapped[list] = mapped_column(JSON, nullable=True)
    # Per-feature distributions of the data this model was trained on --
    # numeric histograms and categorical value frequencies, as produced by
    # generic/drift.py's compute_reference_stats(). This is the *rolling*
    # baseline: each retrain writes a fresh one describing that run's data.
    # The never-updated original lives on CrmConnection.original_baseline, so
    # slow drift across many small retrains can't hide by re-baselining itself
    # a little further each time. Nullable: the 19 rows that predate this
    # column have no baseline and don't need a backfill.
    baseline: Mapped[dict] = mapped_column(JSON, nullable=True)
    trained_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)

    dataset: Mapped["Dataset"] = relationship(back_populates="trained_models")


class CrmConnection(Base):
    """A CRM the user has chosen to keep connected, rather than the one-shot
    paste-a-token-and-import flow. Holding the token is what makes unattended
    background sync possible at all, and is exactly why it is encrypted at
    rest (Fernet, key from FERNET_KEY) and why the connect UI must stop
    telling users their token is never stored."""

    __tablename__ = "crm_connections"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    # Fernet ciphertext, not the token. Text rather than String(n): ciphertext
    # length depends on the token, and silently truncating a credential is a
    # failure mode worth designing out entirely.
    encrypted_token: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    last_synced_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=True)
    # Why the most recent sync failed, surfaced in the status panel. Cleared
    # on the next success, so it always describes the current state.
    last_error: Mapped[str] = mapped_column(Text, nullable=True)
    # Written once, on first training for this connection, and never updated.
    # See TrainedModel.baseline for the rolling counterpart.
    original_baseline: Mapped[dict] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)

    user: Mapped["User"] = relationship()
    synced_contacts: Mapped[list["SyncedContact"]] = relationship(
        back_populates="connection", cascade="all, delete-orphan"
    )
    retrain_events: Mapped[list["RetrainEvent"]] = relationship(
        back_populates="connection", cascade="all, delete-orphan"
    )


class SyncedContact(Base):
    """One contact as most recently seen from the CRM -- the accumulated
    dataset a scheduled retrain trains on.

    Deliberately one row per contact, not one row per sync: a contact edited
    three times must converge to a single row in its latest state, which is
    what the unique (connection_id, external_id) constraint enforces and what
    the sync job upserts against. Appending instead would fill the training
    set with stale duplicates of the same person and quietly corrupt it.

    `synced_at` still moves forward on every upsert, so "what changed since
    T" -- the delta the drift probe reads -- keeps working despite the
    deduplication.
    """

    __tablename__ = "synced_contacts"
    __table_args__ = (
        UniqueConstraint("connection_id", "external_id", name="uq_synced_contacts_connection_external"),
        Index("ix_synced_contacts_connection_synced_at", "connection_id", "synced_at"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    connection_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("crm_connections.id"), nullable=False, index=True
    )
    # The CRM's own id for this record (HubSpot's hs_object_id).
    external_id: Mapped[str] = mapped_column(String(64), nullable=False)
    # The provider's last-modified timestamp, which drives the incremental
    # sync window -- not the same thing as `synced_at` (when WE last saw it).
    source_modified_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=True)
    synced_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.datetime.utcnow
    )
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    # Null means genuinely unlabelled (a blank lifecyclestage), not zero --
    # see hubspot.py's _derive_churned(). `is_labelled` is indexed because
    # the drift gate counts labelled rows, never raw records.
    churned: Mapped[int] = mapped_column(SmallInteger, nullable=True)
    is_labelled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)

    connection: Mapped["CrmConnection"] = relationship(back_populates="synced_contacts")


class RetrainEvent(Base):
    """One drift evaluation that led to a retrain decision -- including the
    ones that decided *not* to retrain, and the ones that tried and failed.

    A row is written whatever the outcome, so the status panel can answer
    "why hasn't it retrained?" as readily as "why did it?". `trained_model_id`
    is nullable precisely because a skipped or failed evaluation has no model
    to point at.
    """

    __tablename__ = "retrain_events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    connection_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("crm_connections.id"), nullable=False, index=True
    )
    trained_model_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("trained_models.id"), nullable=True
    )
    triggered_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.datetime.utcnow, index=True
    )
    # 'drift' | 'skipped_batch_too_small' | 'skipped_cooldown' | 'skipped_no_drift' | 'failed'
    trigger_reason: Mapped[str] = mapped_column(String(100), nullable=False)
    outcome: Mapped[str] = mapped_column(String(50), nullable=False)
    max_psi: Mapped[float] = mapped_column(Float, nullable=True)
    mean_psi: Mapped[float] = mapped_column(Float, nullable=True)
    # {feature: psi} -- what the panel shows when the drift score is clicked.
    per_feature_psi: Mapped[dict] = mapped_column(JSON, nullable=True)
    # Raw records in the probe batch vs. how many carried a usable label. The
    # gate reads the second; both are recorded because "big batch, nothing
    # trainable in it" is the case a reader will otherwise find baffling.
    batch_size: Mapped[int] = mapped_column(Integer, nullable=True)
    labelled_count: Mapped[int] = mapped_column(Integer, nullable=True)
    error: Mapped[str] = mapped_column(Text, nullable=True)

    connection: Mapped["CrmConnection"] = relationship(back_populates="retrain_events")


class DatasetMetrics(Base):
    """The portfolio-level read on one dataset's latest trained/scored run:
    revenue at risk, a Market Impact Explanation, and a Reliability Score for
    the model behind it -- see generic/metrics_agent.py for how each is
    computed and worded. Both the reliability score and the market impact
    severity come with plain-English, non-technical explanations, since a
    bare number was the whole problem this table exists to fix.

    One row per dataset (`dataset_id` unique), upserted on every re-predict
    rather than appended, since only the most recent run's numbers are ever
    shown -- there is no trend view over past runs to keep history for (same
    "single snapshot" reasoning as Dataset/_dataset_context's `available.history`).
    """

    __tablename__ = "dataset_metrics"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    dataset_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("datasets.id"), nullable=False, unique=True, index=True
    )
    # None when the dataset has no monthly_charges field mapped -- see
    # _dataset_context()'s `available.revenue` gating in dataset_routes.py.
    revenue_at_risk: Mapped[float] = mapped_column(Float, nullable=True)
    reliability_score: Mapped[float] = mapped_column(Float, nullable=True)
    # 'Low' | 'Moderate' | 'High' | 'Critical' -- how far this dataset's own
    # churn rate sits from a general industry benchmark. Not a 0-100 score:
    # replaces the earlier market_impact_score (concentration/segment-weight
    # formula), which measured internal portfolio concentration rather than
    # real market consequences and was discarded for exactly that reason.
    market_impact_severity: Mapped[str] = mapped_column(String(20), nullable=True)
    # The full plain-language paragraph (churn rate, projected loss, industry
    # benchmark comparison, 12-month trajectory) with this run's real numbers
    # interpolated in -- see generic/metrics_agent.py's _market_impact_explanation().
    market_impact_explanation: Mapped[str] = mapped_column(Text, nullable=True)
    # {"reliability": {narrative, components}, "marketImpact": {churnRatePct,
    # projectedAnnualLoss, benchmarkUsed, benchmarkIndustry, ...}} -- the
    # structured numbers and per-component tags/text behind both explanations
    # above, so the frontend can highlight individual figures rather than
    # only rendering a paragraph. See generic/metrics_agent.py's
    # compute_dataset_metrics().
    component_breakdown: Mapped[dict] = mapped_column(JSON, nullable=True)
    computed_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=datetime.datetime.utcnow)

    dataset: Mapped["Dataset"] = relationship()


class ActivityEvent(Base):
    """One user-attributed action worth showing on an account's activity feed:
    who trained a model, who drafted/edited/approved/sent an outreach email,
    and when. Distinct from RetrainEvent above (a system-triggered drift-probe
    decision -- no user_id at all, since nobody clicked anything) and from the
    audit trail previously embedded only inside each outreach draft's own JSON
    (backend/api/dataset_routes.py's `auditTrail` list on TrainedModel.
    outreach_drafts) -- that trail is per-draft, not queryable across a user's
    whole history, and was written with the literal string "You"/"System"
    instead of the real signed-in user, which this table's `user_id` fixes.

    `entity_id` is a plain string, not a foreign key: the entity it names (a
    dataset id, a customer id, an outreach draft id) may live in another
    table, in this process's in-memory store only, or already be deleted --
    an activity log has to outlive the thing it once described.
    """

    __tablename__ = "activity_events"
    __table_args__ = (
        Index("ix_activity_events_user_created_at", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id"), nullable=False, index=True
    )
    # 'model_trained' | 'outreach_drafted' | 'outreach_edited' | 'outreach_approved' | 'outreach_sent' | 'outreach_send_failed'
    action_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # 'dataset' | 'customer' | 'outreach' -- what `entity_id` refers to.
    entity_type: Mapped[str] = mapped_column(String(50), nullable=True)
    entity_id: Mapped[str] = mapped_column(String(255), nullable=True)
    # One plain-language sentence, e.g. "Trained a model on accounts.csv
    # (142 customers)" -- rendered as-is, so the feed reads the same whether
    # or not the entity behind entity_id still exists.
    detail: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.datetime.utcnow, index=True
    )

    user: Mapped["User"] = relationship()