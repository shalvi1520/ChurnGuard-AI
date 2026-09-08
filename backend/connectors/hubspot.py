"""
HubSpot connector, using a private-app access token.

A private app is the one HubSpot auth method that doesn't need ChurnGuard to
be a registered OAuth application: the user creates the app in their own
portal, copies the token, and pastes it into the connect form. The token is
sent to this server, used for the request, and discarded -- it is never stored
and never returned to the browser.

`field_map` is the provider-specific normalisation PART 5 asks for: HubSpot's
own property names are translated to ChurnGuard fields directly, so a HubSpot
import needs no column guessing at all for the properties we know.
"""
from typing import Any, Dict, List

import pandas as pd
import requests

from .base import Connector, ConnectorError, CredentialField, DataSource, FetchResult, require_credentials

API_ROOT = "https://api.hubapi.com"
REQUEST_TIMEOUT_SECONDS = 30
PAGE_SIZE = 100

# HubSpot object -> (properties to request, label)
_OBJECTS = {
    "companies": (
        [
            "hs_object_id", "name", "domain", "lifecyclestage", "type", "industry",
            "annualrevenue", "hs_lastmodifieddate", "createdate", "numberofemployees",
        ],
        "Companies",
        "Company records — usually the right level for account churn.",
    ),
    "contacts": (
        [
            "hs_object_id", "email", "firstname", "lastname", "lifecyclestage",
            "hs_lead_status", "createdate", "hs_analytics_num_visits",
        ],
        "Contacts",
        "Individual contact records.",
    ),
    "deals": (
        ["hs_object_id", "dealname", "dealstage", "amount", "closedate", "createdate", "pipeline"],
        "Deals",
        "Deal records — useful when a deal represents a subscription.",
    ),
}


class HubSpotConnector(Connector):
    id = "hubspot"
    label = "HubSpot"
    description = (
        "Import companies, contacts or deals using a private-app token from your own HubSpot portal. "
        "The token is used for the import and never stored."
    )
    status = "available"
    docs_url = "https://developers.hubspot.com/docs/api/private-apps"
    credential_fields = [
        CredentialField(
            key="access_token",
            label="Private app access token",
            secret=True,
            placeholder="pat-na1-...",
            help="HubSpot → Settings → Integrations → Private Apps. Needs CRM read scopes.",
        ),
    ]

    # HubSpot property -> ChurnGuard field. Applied to imported columns before
    # the generic matcher runs.
    field_map = {
        "hs_object_id": "customer_id",
        "amount": "monthly_charges",
        "annualrevenue": "total_charges",
        "type": "contract_type",
        "pipeline": "contract_type",
        "industry": "service_tier",
        "lifecyclestage": "service_tier",
    }

    def _headers(self, credentials: Dict[str, str]) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {credentials['access_token'].strip()}",
            "Content-Type": "application/json",
        }

    def _get(self, credentials: Dict[str, str], path: str, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            response = requests.get(
                f"{API_ROOT}{path}",
                headers=self._headers(credentials),
                params=params,
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
        except requests.exceptions.Timeout as exc:
            raise ConnectorError(
                "HubSpot didn't respond in time.",
                "Try again in a moment — if it keeps happening, check HubSpot's status page.",
            ) from exc
        except requests.exceptions.RequestException as exc:
            raise ConnectorError(
                "We couldn't reach HubSpot.",
                "Check this machine's network connection and try again.",
            ) from exc

        if response.status_code == 401:
            raise ConnectorError(
                "HubSpot rejected that access token.",
                "Copy the token again from Settings → Integrations → Private Apps, and check it hasn't been rotated.",
            )
        if response.status_code == 403:
            raise ConnectorError(
                "That token doesn't have permission to read this data.",
                "Add the CRM read scopes to the private app in HubSpot, then try again.",
            )
        if response.status_code == 429:
            raise ConnectorError(
                "HubSpot is rate-limiting this portal right now.",
                "Wait a minute and try the import again.",
            )
        if response.status_code >= 400:
            raise ConnectorError(
                f"HubSpot returned an error ({response.status_code}).",
                "Check the private app is still installed in your portal.",
            )
        return response.json()

    def test_connection(self, credentials: Dict[str, str]) -> Dict[str, Any]:
        require_credentials(self, credentials)
        self.require_available()
        payload = self._get(credentials, "/crm/v3/objects/companies", {"limit": 1})
        return {
            "connected": True,
            "account": "HubSpot portal",
            "message": f"Connected. {len(payload.get('results', []))} record read as a check.",
        }

    def list_sources(self, credentials: Dict[str, str]) -> List[DataSource]:
        return [DataSource(id=key, label=meta[1], description=meta[2]) for key, meta in _OBJECTS.items()]

    @staticmethod
    def normalize(results: List[dict]) -> pd.DataFrame:
        """Flattens HubSpot's `{id, properties: {...}}` envelope into one row
        per record. Kept static so it can be unit-tested without a network call."""
        rows = []
        for record in results:
            row = {"hs_object_id": record.get("id")}
            row.update(record.get("properties") or {})
            rows.append(row)
        frame = pd.DataFrame(rows)
        # HubSpot echoes these back on every object and they carry no churn
        # signal -- dropping them keeps the mapping review free of noise.
        return frame.drop(columns=[c for c in ("hs_lastmodifieddate", "hs_createdate") if c in frame.columns])

    def fetch(self, credentials: Dict[str, str], source_id: str, limit: int) -> FetchResult:
        require_credentials(self, credentials)
        self.require_available()
        if source_id not in _OBJECTS:
            raise ConnectorError(
                f"'{source_id}' isn't a HubSpot record type ChurnGuard can import.",
                f"Choose one of: {', '.join(_OBJECTS)}.",
            )

        properties, label, _ = _OBJECTS[source_id]
        collected: List[dict] = []
        after = None
        while len(collected) < limit:
            params: Dict[str, Any] = {
                "limit": min(PAGE_SIZE, limit - len(collected)),
                "properties": ",".join(properties),
            }
            if after:
                params["after"] = after
            payload = self._get(credentials, f"/crm/v3/objects/{source_id}", params)
            batch = payload.get("results", [])
            collected.extend(batch)
            after = (payload.get("paging") or {}).get("next", {}).get("after")
            if not after or not batch:
                break

        if not collected:
            raise ConnectorError(
                f"Your HubSpot portal returned no {label.lower()}.",
                "Pick a different record type, or check the private app can see this data.",
            )

        return FetchResult(
            records=self.normalize(collected),
            source_label=f"HubSpot {label}",
            detail=f"{len(collected):,} {label.lower()} imported",
            notes=[
                "HubSpot has no churn field of its own — map one of your own properties to the churn outcome "
                "if you track cancellations there."
            ],
        )
