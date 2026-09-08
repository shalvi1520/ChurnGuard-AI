"""
CRM / API connection endpoints.

Every one of these runs server-side, which is the point: provider credentials
are posted to this API, used for that one request, and dropped. They are never
persisted, never logged, and never sent back to the browser -- so no CRM token
ends up in React state that outlives the flow, in localStorage, or in a
VITE_-prefixed build variable.

A successful import ends in exactly the same place an uploaded file does: one
DatasetEntry in the store, ready for the same validate -> map -> predict path.
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import connectors
from ..connectors import ConnectorError
from . import ingest
from .store import DatasetSource

router = APIRouter(prefix="/api/connectors", tags=["connectors"])

# A prototype pulls a working sample, not an entire CRM. Stated in the UI.
DEFAULT_IMPORT_LIMIT = 5000
MAX_IMPORT_LIMIT = 20000


class ConnectorRequest(BaseModel):
    credentials: Dict[str, str] = Field(default_factory=dict)


class ImportRequest(ConnectorRequest):
    sourceId: str = "default"
    limit: int = DEFAULT_IMPORT_LIMIT


def _connector_or_404(provider_id: str):
    connector = connectors.get_connector(provider_id)
    if connector is None:
        raise HTTPException(404, f"'{provider_id}' isn't a data source ChurnGuard knows about.")
    return connector


def _as_http_error(exc: ConnectorError) -> HTTPException:
    return HTTPException(400, f"{exc.message} {exc.hint}".strip() if exc.hint else exc.message)


@router.get("")
def list_connectors() -> Dict[str, Any]:
    """What the user can connect to, and what is only scaffolded so far.

    `status` is the honest one: 'available' means it really connects,
    'coming_soon' means the integration isn't built and will refuse to run.
    """
    return {
        "connectors": [c.as_dict() for c in connectors.all_connectors()],
        "defaultLimit": DEFAULT_IMPORT_LIMIT,
        "maxLimit": MAX_IMPORT_LIMIT,
    }


@router.post("/{provider_id}/test")
def test_connection(provider_id: str, body: ConnectorRequest) -> Dict[str, Any]:
    connector = _connector_or_404(provider_id)
    try:
        return connector.test_connection(body.credentials)
    except ConnectorError as exc:
        raise _as_http_error(exc) from exc


@router.post("/{provider_id}/sources")
def list_sources(provider_id: str, body: ConnectorRequest) -> Dict[str, Any]:
    connector = _connector_or_404(provider_id)
    try:
        return {"sources": [s.as_dict() for s in connector.list_sources(body.credentials)]}
    except ConnectorError as exc:
        raise _as_http_error(exc) from exc


@router.post("/{provider_id}/import")
def import_records(provider_id: str, body: ImportRequest) -> Dict[str, Any]:
    """Pulls records, normalises them, and registers them as the active
    dataset -- the same object an uploaded file produces."""
    connector = _connector_or_404(provider_id)
    limit = max(1, min(body.limit or DEFAULT_IMPORT_LIMIT, MAX_IMPORT_LIMIT))

    try:
        result = connector.fetch(body.credentials, body.sourceId, limit)
    except ConnectorError as exc:
        raise _as_http_error(exc) from exc

    frame = result.records
    notes: List[str] = list(result.notes)
    # Provider-specific normalisation first: where the connector already knows
    # what a column means, the generic matcher doesn't have to guess.
    renamed = ingest.apply_provider_field_map(frame, connector.field_map)
    if renamed:
        notes.append("Recognised " + ", ".join(renamed) + " from the provider's own schema.")

    try:
        entry = ingest.register_dataframe(
            frame,
            filename=result.source_label,
            size=int(frame.memory_usage(deep=True).sum()),
            source=DatasetSource(
                kind="crm",
                label=connector.label,
                provider=connector.id,
                detail=result.detail or result.source_label,
            ),
        )
    except ingest.IngestError as exc:
        raise ingest.as_http_error(exc) from exc

    return ingest.describe_entry(entry, notes)
