"""
Persistent tables: who a user is, which datasets they've connected, and
which of those have already been trained -- so reconnecting the same data
doesn't mean paying for another Optuna-tuned stacking fit. The active
dataset's raw rows, customer scores and SHAP caches stay in-memory
(backend/api/store.py); only what should survive a restart lives here.
"""
import datetime
import uuid

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _uuid() -> str:
    return uuid.uuid4().hex


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    company: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)
    last_login_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=True)

    datasets: Mapped[list["Dataset"]] = relationship(back_populates="user", cascade="all, delete-orphan")


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
    trained_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)

    dataset: Mapped["Dataset"] = relationship(back_populates="trained_models")