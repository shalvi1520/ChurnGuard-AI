"""
one_off_fix_demo_emails.py -- cycles every contact in the HubSpot sandbox
through 3-4 real, team-controlled addresses so retention emails land
somewhere you can check. Run once, manually, from the project root.
Never imported by the running application.
"""
import os
import time
import requests
from dotenv import load_dotenv

load_dotenv()

API_ROOT = "https://api.hubapi.com"
ACCESS_TOKEN = os.getenv("HUBSPOT_ACCESS_TOKEN")

if not ACCESS_TOKEN:
    raise RuntimeError("HUBSPOT_ACCESS_TOKEN is not set in .env")

REAL_EMAILS = [
    "farhasherani07@gmail.com",
    "anarkalidiscowalichli@gmail.com",
    "msytic1191@gmail.com",
    "bgmi8771@gmail.com",
    "cod341141@gmail.com",
]
BATCH_SIZE = 100

headers = {"Authorization": f"Bearer {ACCESS_TOKEN}", "Content-Type": "application/json"}


def get_all_contact_ids():
    ids, after = [], None
    while True:
        params = {"limit": 100, "properties": "email"}
        if after:
            params["after"] = after
        resp = requests.get(f"{API_ROOT}/crm/v3/objects/contacts", headers=headers, params=params, timeout=30)
        resp.raise_for_status()
        payload = resp.json()
        ids.extend(c["id"] for c in payload.get("results", []))
        after = (payload.get("paging") or {}).get("next", {}).get("after")
        if not after:
            break
    return ids


def batch_update_emails(contact_ids):
    """HubSpot enforces 'email' as unique per contact, so the same address
    cannot be reused across many contacts in one update. Gmail's plus-
    addressing gives each contact a distinct address (satisfying HubSpot)
    while still delivering to one of the real REAL_EMAILS inboxes -- and
    the customer's HubSpot contact id embedded in it makes each arrived
    email traceable back to which customer it was for."""
    for i in range(0, len(contact_ids), BATCH_SIZE):
        chunk = contact_ids[i:i + BATCH_SIZE]
        inputs = []
        for j, cid in enumerate(chunk, start=i):
            base_email = REAL_EMAILS[j % len(REAL_EMAILS)]
            local_part, domain = base_email.split("@")
            unique_email = f"{local_part}+cust{cid}@{domain}"
            inputs.append({"id": cid, "properties": {"email": unique_email}})

        resp = requests.post(
            f"{API_ROOT}/crm/v3/objects/contacts/batch/update",
            headers=headers, json={"inputs": inputs}, timeout=30,
        )
        try:
            resp.raise_for_status()
        except requests.exceptions.HTTPError:
            print("=== HUBSPOT ERROR RESPONSE (BATCH UPDATE) ===")
            print(resp.status_code)
            print(resp.text)
            print("================================================")
            raise
        print(f"Updated {i + len(chunk)}/{len(contact_ids)}")
        time.sleep(0.5)


if __name__ == "__main__":
    ids = get_all_contact_ids()
    print(f"Found {len(ids)} contacts")
    batch_update_emails(ids)
    print("Done.")