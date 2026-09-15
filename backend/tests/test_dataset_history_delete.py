"""
DELETE /api/datasets/history/{id} -- permanently removing one dataset history
row and its trained models, the persisted counterpart to DELETE /api/dataset
(store.reset()), which only ever clears the in-memory *active* session and
never touches Neon.

Rows are inserted directly against the test database rather than produced by
a real upload/validate/map-columns/predict run: what this endpoint is
responsible for -- ownership, cascade-deleting TrainedModel rows, and
clearing the in-memory active dataset when it matches the row being deleted
-- doesn't depend on a real model having been fit, and a genuine Optuna +
stacking run (see test_predict_characterization.py) costs real time per test.

Run with: python -m pytest backend/tests/test_dataset_history_delete.py -v
"""
import time
from concurrent.futures import ThreadPoolExecutor

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.api import store
from backend.api.main import app
from backend.api.store import DatasetEntry, DatasetSource
from backend.db.database import SessionLocal
from backend.db.models import Dataset as DatasetRow
from backend.db.models import TrainedModel


def _signup(client: TestClient, label: str) -> dict:
    email = f"histdel-{label}-{int(time.time() * 1000)}@example.com"
    resp = client.post(
        "/api/auth/signup",
        json={"email": email, "password": "password123", "name": "History Delete", "acceptedTerms": True},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["user"]


def _seed_dataset_row(user_id: str, fingerprint: str = "fp-histdel") -> tuple[str, str]:
    """Inserts a Dataset + TrainedModel row directly -- see module docstring."""
    db = SessionLocal()
    try:
        dataset_row = DatasetRow(
            user_id=user_id,
            filename="seed.csv",
            source_kind="upload",
            row_count=10,
            column_count=3,
            fingerprint=fingerprint,
        )
        db.add(dataset_row)
        db.flush()
        model_row = TrainedModel(
            dataset_id=dataset_row.id,
            fingerprint=fingerprint,
            artifact_dir="/tmp/histdel-nowhere",
            report={"test_metrics": {}},
        )
        db.add(model_row)
        db.commit()
        return dataset_row.id, model_row.id
    finally:
        db.close()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _clean_store():
    """The in-memory active-dataset store is process-global (backend/api/
    store.py), so a test that populates it must not leak state into whatever
    test runs next."""
    store.reset()
    yield
    store.reset()


def test_delete_requires_sign_in():
    with TestClient(app) as anon:
        resp = anon.delete("/api/datasets/history/does-not-exist")
    assert resp.status_code == 401


def test_delete_404s_for_a_row_owned_by_someone_else(client):
    owner = _signup(client, "owner")
    dataset_id, model_id = _seed_dataset_row(owner["id"])

    with TestClient(app) as other:
        _signup(other, "other")
        resp = other.delete(f"/api/datasets/history/{dataset_id}")
    assert resp.status_code == 404

    # Untouched: a failed ownership check must not have deleted anything.
    db = SessionLocal()
    try:
        assert db.query(DatasetRow).filter(DatasetRow.id == dataset_id).first() is not None
        assert db.query(TrainedModel).filter(TrainedModel.id == model_id).first() is not None
    finally:
        db.close()


def test_delete_removes_the_dataset_and_cascades_to_its_trained_models(client):
    user = _signup(client, "owned")
    dataset_id, model_id = _seed_dataset_row(user["id"])

    resp = client.delete(f"/api/datasets/history/{dataset_id}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["id"] == dataset_id

    db = SessionLocal()
    try:
        assert db.query(DatasetRow).filter(DatasetRow.id == dataset_id).first() is None
        # The whole point of relying on Dataset.trained_models' cascade
        # ("all, delete-orphan"): no orphaned TrainedModel row left behind.
        assert db.query(TrainedModel).filter(TrainedModel.id == model_id).first() is None
    finally:
        db.close()


def test_delete_404s_on_a_repeat_call(client):
    """Idempotent-looking but not idempotent-by-design: the row is genuinely
    gone after the first call, so a second call has nothing left to find."""
    user = _signup(client, "repeat")
    dataset_id, _ = _seed_dataset_row(user["id"])

    first = client.delete(f"/api/datasets/history/{dataset_id}")
    assert first.status_code == 200

    second = client.delete(f"/api/datasets/history/{dataset_id}")
    assert second.status_code == 404


def test_delete_clears_the_active_dataset_when_it_was_reopened_from_this_row(client):
    """POST .../reopen sets the in-memory entry's id to the dataset row's own
    id (see reopen_dataset_history) -- deleting that row must drop the active
    dataset too, or the UI would keep showing data for something gone from
    history."""
    user = _signup(client, "reopened")
    dataset_id, _ = _seed_dataset_row(user["id"])

    store.create_dataset(DatasetEntry(
        id=dataset_id,
        filename="reopened.csv",
        size=0,
        raw_df=pd.DataFrame(),
        profile={"rowCount": 10, "columnCount": 3},
        source=DatasetSource(),
    ))

    resp = client.delete(f"/api/datasets/history/{dataset_id}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["activeDatasetCleared"] is True
    assert store.get_current() is None


def test_delete_clears_the_active_dataset_when_it_matches_by_fingerprint(client):
    """A dataset just uploaded and trained in the SAME session has an
    in-memory entry.id that is a fresh "DS-<timestamp>" from
    ingest.register_dataframe(), unrelated to any database row -- only its
    content fingerprint ties it to the history row being deleted."""
    user = _signup(client, "active")
    fingerprint = f"fp-active-{int(time.time() * 1000)}"
    dataset_id, _ = _seed_dataset_row(user["id"], fingerprint=fingerprint)

    store.create_dataset(DatasetEntry(
        id="DS-unrelated-to-the-row",
        filename="active.csv",
        size=0,
        raw_df=pd.DataFrame(),
        profile={"rowCount": 10, "columnCount": 3},
        source=DatasetSource(),
        fingerprint=fingerprint,
    ))

    resp = client.delete(f"/api/datasets/history/{dataset_id}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["activeDatasetCleared"] is True
    assert store.get_current() is None


def test_bulk_delete_of_an_already_gone_row_returns_zero_without_raising(client):
    """The mechanism the race fix relies on: a bulk DELETE ... WHERE against
    a row that no longer exists (or never existed) returns 0 matched rows as
    a plain, silent outcome -- never the SAWarning that Session.delete(obj) +
    flush raises when its "exactly one row" expectation is violated. This is
    what lets the second of two racing DELETE requests for the same row
    resolve to a clean "already gone" result instead of a warning."""
    user = _signup(client, "bulk-idem")
    dataset_id, _ = _seed_dataset_row(user["id"])

    db = SessionLocal()
    try:
        never_existed = (
            db.query(DatasetRow).filter(DatasetRow.id == "does-not-exist-at-all").delete(synchronize_session=False)
        )
        db.commit()
        assert never_existed == 0

        # Children first, same order and same reason as the endpoint: the FK
        # has no DB-level cascade, and this test database enforces it strictly.
        db.query(TrainedModel).filter(TrainedModel.dataset_id == dataset_id).delete(synchronize_session=False)
        first = db.query(DatasetRow).filter(DatasetRow.id == dataset_id).delete(synchronize_session=False)
        db.commit()
        assert first == 1

        # Same statements again, against a row this session just removed --
        # exactly the shape of the second half of a race.
        db.query(TrainedModel).filter(TrainedModel.dataset_id == dataset_id).delete(synchronize_session=False)
        second = db.query(DatasetRow).filter(DatasetRow.id == dataset_id).delete(synchronize_session=False)
        db.commit()
        assert second == 0
    finally:
        db.close()


def test_concurrent_deletes_for_the_same_row_never_500_and_leave_it_gone_exactly_once(client):
    """Two requests for the SAME row's delete, fired as close to
    simultaneously as real threads allow -- the scenario a double-click or a
    duplicate frontend request produces. Neither may ever 500 (the old
    Session.delete()-based version didn't 500 either, but it did log a
    SAWarning while quietly reporting success for a delete that deleted
    nothing); the row must end up gone exactly once, with its TrainedModel
    row gone too and nothing orphaned."""
    user = _signup(client, "concurrent")
    dataset_id, model_id = _seed_dataset_row(user["id"])

    def _delete():
        return client.delete(f"/api/datasets/history/{dataset_id}")

    with ThreadPoolExecutor(max_workers=2) as pool:
        first, second = [f.result() for f in [pool.submit(_delete), pool.submit(_delete)]]

    for resp in (first, second):
        assert resp.status_code in (200, 404), resp.text
        if resp.status_code == 200:
            assert resp.json()["status"] in ("deleted", "already_deleted")

    # Regardless of how the two requests interleaved, the end state is
    # unambiguous: the row and its trained model are gone, exactly once.
    db = SessionLocal()
    try:
        assert db.query(DatasetRow).filter(DatasetRow.id == dataset_id).first() is None
        assert db.query(TrainedModel).filter(TrainedModel.id == model_id).first() is None
    finally:
        db.close()


def test_delete_leaves_an_unrelated_active_dataset_alone(client):
    """Deleting one history row must not clear the active dataset when it is
    neither the reopened row nor a fingerprint match -- a user deleting an old
    entry from History shouldn't disconnect whatever they're using right now."""
    user = _signup(client, "unrelated")
    dataset_id, _ = _seed_dataset_row(user["id"], fingerprint="fp-being-deleted")

    store.create_dataset(DatasetEntry(
        id="DS-currently-active",
        filename="still-active.csv",
        size=0,
        raw_df=pd.DataFrame(),
        profile={"rowCount": 5, "columnCount": 2},
        source=DatasetSource(),
        fingerprint="fp-still-active",
    ))

    resp = client.delete(f"/api/datasets/history/{dataset_id}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["activeDatasetCleared"] is False
    current = store.get_current()
    assert current is not None
    assert current.id == "DS-currently-active"
