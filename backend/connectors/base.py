"""
The connector contract every CRM/API integration implements.

The whole point of this layer is that a connector's only job is to return a
pandas DataFrame of customer records. Everything after that -- profiling,
automatic column matching, validation, training, prediction, the dashboard --
is the exact same code path an uploaded CSV takes. There is deliberately no
separate CRM prediction or dashboard path.

    CRM / API  ->  Connector  ->  DataFrame  ->  (same pipeline as a file)

Credentials are passed in per request and used only for that request. Nothing
here writes a token to disk, and no connector secret is ever sent to the
browser.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import pandas as pd


class ConnectorError(Exception):
    """A failure we can explain to the user. `hint` says what to do about it."""

    def __init__(self, message: str, hint: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.hint = hint


@dataclass
class CredentialField:
    """One input the connect form should render. `secret=True` means it is a
    token/password: the UI masks it and it is never echoed back.

    `required=False` marks a genuinely optional input (an auth header for an
    endpoint that doesn't need one). Both this module's `require_credentials`
    and the connect form key off it, so an optional field must never block a
    connection."""
    key: str
    label: str
    secret: bool = False
    placeholder: str = ""
    help: str = ""
    required: bool = True

    def as_dict(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "secret": self.secret,
            "placeholder": self.placeholder,
            "help": self.help,
            "required": self.required,
        }


@dataclass
class DataSource:
    """A selectable collection of records inside the provider (a CRM object,
    a report, an endpoint)."""
    id: str
    label: str
    description: str = ""

    def as_dict(self) -> Dict[str, Any]:
        return {"id": self.id, "label": self.label, "description": self.description}


@dataclass
class FetchResult:
    records: pd.DataFrame
    source_label: str
    detail: str = ""
    notes: List[str] = field(default_factory=list)


class Connector:
    """Subclasses implement `test_connection`, `list_sources` and `fetch`.

    `status` is either 'available' (implemented and usable right now) or
    'coming_soon' (scaffolded only). A 'coming_soon' connector must never
    return invented records -- it raises instead, so the UI can say plainly
    that the integration isn't ready rather than faking a connection.
    """

    id: str = ""
    label: str = ""
    description: str = ""
    status: str = "coming_soon"
    docs_url: str = ""
    credential_fields: List[CredentialField] = []
    # Provider-native field name -> ChurnGuard field key. Applied before the
    # generic matcher runs, so a provider we know the schema of needs no
    # guessing at all.
    field_map: Dict[str, str] = {}

    def as_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "description": self.description,
            "status": self.status,
            "docsUrl": self.docs_url,
            "credentialFields": [f.as_dict() for f in self.credential_fields],
        }

    def require_available(self) -> None:
        if self.status != "available":
            raise ConnectorError(
                f"The {self.label} integration isn't available yet.",
                "It needs a registered OAuth application before it can connect to a real account. "
                "In the meantime you can upload an export from this system as a CSV or Excel file.",
            )

    def test_connection(self, credentials: Dict[str, str]) -> Dict[str, Any]:
        raise NotImplementedError

    def list_sources(self, credentials: Dict[str, str]) -> List[DataSource]:
        raise NotImplementedError

    def fetch(self, credentials: Dict[str, str], source_id: str, limit: int) -> FetchResult:
        raise NotImplementedError


def require_credentials(connector: Connector, credentials: Dict[str, str]) -> None:
    """Checks only the fields the connector actually needs. Optional fields
    (`required=False`) are skipped -- treating them as mandatory made the HTTP
    endpoint connector impossible to use without an auth header it had already
    documented as optional."""
    missing = [
        f.label
        for f in connector.credential_fields
        if f.required and not (credentials or {}).get(f.key, "").strip()
    ]
    if missing:
        raise ConnectorError(
            f"{connector.label} needs {', '.join(missing)} before it can connect.",
            "Fill in the connection details and try again.",
        )
