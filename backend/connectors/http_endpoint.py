"""
Generic HTTP/API connector: pulls customer records from any endpoint that
returns CSV or JSON.

This is the provider-agnostic escape hatch. Most CRMs and data warehouses can
expose a saved report or query result at a URL, and this connector reads it
without ChurnGuard needing to know anything about the vendor. The automatic
column matcher then works out the fields, exactly as it does for an upload.
"""
import io
import json
from typing import Any, Dict, List

import pandas as pd
import requests

from .base import Connector, ConnectorError, CredentialField, DataSource, FetchResult, require_credentials

REQUEST_TIMEOUT_SECONDS = 30
MAX_RESPONSE_BYTES = 50 * 1024 * 1024


def _extract_records(payload: Any) -> List[dict]:
    """Finds the list of records in a JSON response. Handles a bare array and
    the common `{"results": [...]}` / `{"data": [...]}` envelopes."""
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("results", "data", "records", "items", "rows", "value"):
            if isinstance(payload.get(key), list):
                return payload[key]
    raise ConnectorError(
        "That endpoint didn't return a list of customer records.",
        'Expected either a CSV body or JSON shaped like [{...}] or {"results": [{...}]}.',
    )


class HttpEndpointConnector(Connector):
    id = "http_endpoint"
    label = "HTTP endpoint (CSV or JSON)"
    description = (
        "Read customers straight from any URL your systems already expose — a saved CRM report, a data-warehouse "
        "query result, or your own API. Send an auth header if the endpoint needs one."
    )
    status = "available"
    credential_fields = [
        CredentialField(
            key="url",
            label="Endpoint URL",
            placeholder="https://api.example.com/customers.csv",
            help="Must return CSV or JSON. Called from the ChurnGuard server, not your browser.",
        ),
        CredentialField(
            key="auth_header",
            label="Authorization header",
            secret=True,
            required=False,
            placeholder="Bearer sk-...",
            help="Only if the endpoint needs one. Sent as the Authorization header; never stored and never sent back to the browser.",
        ),
    ]

    def _request(self, credentials: Dict[str, str]) -> requests.Response:
        url = (credentials.get("url") or "").strip()
        if not url.lower().startswith(("http://", "https://")):
            raise ConnectorError(
                "That doesn't look like a valid URL.",
                "Enter the full address including https://.",
            )
        headers = {"Accept": "text/csv, application/json;q=0.9, */*;q=0.5"}
        auth = (credentials.get("auth_header") or "").strip()
        if auth:
            headers["Authorization"] = auth
        try:
            response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT_SECONDS, stream=True)
        except requests.exceptions.Timeout as exc:
            raise ConnectorError(
                "That endpoint didn't respond in time.",
                "Check the URL is reachable from this machine, then try again.",
            ) from exc
        except requests.exceptions.RequestException as exc:
            raise ConnectorError(
                "We couldn't reach that endpoint.",
                "Check the URL and your network connection, then try again.",
            ) from exc

        if response.status_code == 401 or response.status_code == 403:
            raise ConnectorError(
                "That endpoint rejected the credentials.",
                "Check the Authorization header value and try again.",
            )
        if response.status_code >= 400:
            raise ConnectorError(
                f"That endpoint returned an error ({response.status_code}).",
                "Check the URL is correct and the record set is available.",
            )
        return response

    def _read_body(self, response: requests.Response) -> bytes:
        chunks, total = [], 0
        for chunk in response.iter_content(chunk_size=65536):
            total += len(chunk)
            if total > MAX_RESPONSE_BYTES:
                raise ConnectorError(
                    "That endpoint returned more data than ChurnGuard can read in one go (50MB limit).",
                    "Add a limit or date filter to the query and try again.",
                )
            chunks.append(chunk)
        return b"".join(chunks)

    def _to_frame(self, response: requests.Response) -> pd.DataFrame:
        body = self._read_body(response)
        if not body.strip():
            raise ConnectorError(
                "That endpoint returned an empty response.",
                "Check the query actually returns rows.",
            )

        content_type = (response.headers.get("content-type") or "").lower()
        looks_json = "json" in content_type or body.lstrip()[:1] in (b"{", b"[")

        if looks_json:
            try:
                payload = json.loads(body.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise ConnectorError(
                    "That endpoint returned JSON we couldn't read.",
                    "Check the response is valid UTF-8 JSON.",
                ) from exc
            records = _extract_records(payload)
            if not records:
                raise ConnectorError(
                    "That endpoint returned no customer records.",
                    "Check the query actually returns rows.",
                )
            return pd.json_normalize(records)

        try:
            return pd.read_csv(io.BytesIO(body), keep_default_na=False, na_values=[""])
        except Exception as exc:  # noqa: BLE001 -- pandas raises several unrelated types here
            raise ConnectorError(
                "That endpoint's response couldn't be read as CSV or JSON.",
                "Make sure it returns comma-separated rows with a header line, or a JSON array of records.",
            ) from exc

    def test_connection(self, credentials: Dict[str, str]) -> Dict[str, Any]:
        require_credentials(self, credentials)
        frame = self._to_frame(self._request(credentials))
        return {
            "connected": True,
            "account": credentials["url"],
            "message": f"Read {len(frame):,} records with {len(frame.columns)} columns.",
        }

    def list_sources(self, credentials: Dict[str, str]) -> List[DataSource]:
        # A single URL is a single record set -- there is nothing to choose
        # between, so we return the one source rather than inventing options.
        return [DataSource(id="default", label="Records at this URL", description=credentials.get("url", ""))]

    def fetch(self, credentials: Dict[str, str], source_id: str, limit: int) -> FetchResult:
        require_credentials(self, credentials)
        frame = self._to_frame(self._request(credentials))
        notes = []
        if limit and len(frame) > limit:
            frame = frame.head(limit)
            notes.append(f"Read the first {limit:,} records.")
        return FetchResult(
            records=frame,
            source_label="HTTP endpoint",
            detail=credentials["url"],
            notes=notes,
        )
