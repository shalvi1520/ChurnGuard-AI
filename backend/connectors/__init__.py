"""
Connector registry. Adding a CRM means writing one Connector subclass and
listing it here -- nothing in the dataset/prediction/dashboard pipeline
changes, because every connector hands back the same DataFrame shape an
uploaded file produces.
"""
from typing import Dict, List, Optional

from .base import Connector, ConnectorError, CredentialField, DataSource, FetchResult
from .http_endpoint import HttpEndpointConnector
from .hubspot import HubSpotConnector

_REGISTRY: Dict[str, Connector] = {
    c.id: c
    for c in (HubSpotConnector(), HttpEndpointConnector())
}


def all_connectors() -> List[Connector]:
    """Available integrations first, so the UI naturally leads with what works."""
    return sorted(_REGISTRY.values(), key=lambda c: (c.status != "available", c.label))


def get_connector(provider_id: str) -> Optional[Connector]:
    return _REGISTRY.get(provider_id)


__all__ = [
    "Connector",
    "ConnectorError",
    "CredentialField",
    "DataSource",
    "FetchResult",
    "all_connectors",
    "get_connector",
]
