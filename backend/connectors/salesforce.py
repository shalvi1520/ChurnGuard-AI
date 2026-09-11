"""
Salesforce connector -- scaffolded, not yet available.

Salesforce needs a Connected App (client id + secret registered in the target
org) before any OAuth flow can start, and ChurnGuard has no such registration.
Rather than pretend, this connector reports `coming_soon` and refuses to run:
`require_available()` raises with an explanation, so the UI can label it
honestly and point the user at the working paths.

The field map below is real and stays useful the moment credentials exist --
it is what a Salesforce Account/Contract query would be normalised through.
"""
from typing import Any, Dict, List

from .base import Connector, CredentialField, DataSource


class SalesforceConnector(Connector):
    id = "salesforce"
    label = "Salesforce"
    description = (
        "Import Accounts and Contracts from Salesforce. Needs a Connected App registered in your org, "
        "which this prototype doesn't have yet."
    )
    status = "coming_soon"
    docs_url = "https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_oauth_and_connected_apps.htm"
    credential_fields = [
        CredentialField(key="instance_url", label="Instance URL", placeholder="https://your-org.my.salesforce.com"),
        CredentialField(key="access_token", label="OAuth access token", secret=True),
    ]

    # Salesforce SObject field -> ChurnGuard field, ready for when the OAuth
    # flow exists. Nothing calls this yet.
    field_map = {
        "Id": "customer_id",
        "AccountNumber": "customer_id",
        "Type": "contract_type",
        "ContractTerm": "contract_type",
        "AnnualRevenue": "total_charges",
        "MRR__c": "monthly_charges",
        "Industry": "service_tier",
        "Churned__c": "churn",
    }

    def test_connection(self, credentials: Dict[str, str]) -> Dict[str, Any]:
        self.require_available()

    def list_sources(self, credentials: Dict[str, str]) -> List[DataSource]:
        self.require_available()

    def fetch(self, credentials: Dict[str, str], source_id: str, limit: int):
        self.require_available()
