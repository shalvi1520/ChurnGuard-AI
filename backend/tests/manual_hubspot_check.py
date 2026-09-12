"""
Manual HubSpot check -- NOT a pytest test (hence the name: pytest only
auto-collects test_*.py, and this one needs a real token and a live network
call, so it must never run in CI).

Answers one question against your own portal: after the lifecycle-stage churn
rule in HubSpotConnector._derive_churned(), how much of your data actually
survives as *labelled* training rows?

Run it with a private-app token:

    HUBSPOT_TOKEN=pat-na1-... python -m backend.tests.manual_hubspot_check

Reads nothing but the token, writes nothing, and calls the connector's own
code -- so the counts it prints are what a real import would produce, not a
reimplementation that could drift from it.
"""
import os
import sys

from ..connectors.hubspot import ACTIVE_LIFECYCLE_STAGES, HubSpotConnector

RECORD_LIMIT = int(os.getenv("HUBSPOT_LIMIT", "1000"))


def main() -> int:
    token = os.getenv("HUBSPOT_TOKEN", "").strip()
    if not token:
        print("Set HUBSPOT_TOKEN to a private-app token first, e.g.")
        print("    HUBSPOT_TOKEN=pat-na1-... python -m backend.tests.manual_hubspot_check")
        return 2

    connector = HubSpotConnector()
    credentials = {"access_token": token}

    print(f"Fetching up to {RECORD_LIMIT:,} contacts from HubSpot...\n")
    # normalize() only -- deliberately NOT _derive_churned(), so the raw
    # lifecyclestage distribution can be reported before it's consumed.
    raw = connector.normalize(
        _collect(connector, credentials, "contacts", RECORD_LIMIT)
    )
    total = len(raw)
    if total == 0:
        print("No contacts returned.")
        return 1

    if "lifecyclestage" not in raw.columns:
        print(f"{total:,} contacts returned, but none carry a lifecyclestage property.")
        print("Every row would be unlabelled -> nothing left to train on.")
        return 1

    stage = raw["lifecyclestage"].astype(str).str.strip().str.lower()
    blank = raw["lifecyclestage"].isna() | stage.isin({"", "nan", "none"})

    print("Lifecycle stage distribution")
    print("-" * 46)
    for value, count in stage.where(~blank, "(blank)").value_counts().items():
        if value == "(blank)":
            verdict = "unlabelled - dropped from training"
        elif value in ACTIVE_LIFECYCLE_STAGES:
            verdict = "churned = 0"
        else:
            verdict = "churned = 1"
        print(f"  {value:<28} {count:>7,}  {verdict}")

    # The real thing: run the connector's own derivation and count what's left.
    derived = connector._derive_churned(raw)
    labelled = derived["churned"] != ""
    dropped = int((~labelled).sum())
    kept = int(labelled.sum())
    churned_count = int((derived["churned"] == 1).sum())
    retained_count = int((derived["churned"] == 0).sum())

    print("\nTraining data that survives")
    print("-" * 46)
    print(f"  contacts fetched                {total:>7,}")
    print(f"  dropped (no lifecycle stage)    {dropped:>7,}  ({dropped / total:.1%})")
    print(f"  usable for training             {kept:>7,}  ({kept / total:.1%})")
    print(f"      of which churned (1)        {churned_count:>7,}")
    print(f"      of which retained (0)       {retained_count:>7,}")

    if kept:
        minority = min(churned_count, retained_count)
        print(f"\n  minority class size             {minority:>7,}")
        if minority < 6:
            print("  ^ below the 6-row floor the trainer requires; training would be refused.")
        elif minority < 20:
            print("  ^ thin: enough to train, but metrics on a split this small are unstable.")

    print(
        "\nThis is a read-only check. To actually import, POST to "
        "/api/connectors/hubspot/import"
    )
    return 0


def _collect(connector: HubSpotConnector, credentials: dict, source_id: str, limit: int) -> list:
    """Pages the contacts endpoint the same way fetch() does, but without
    building a FetchResult -- this script wants the raw records."""
    from ..connectors.hubspot import _OBJECTS

    properties = _OBJECTS[source_id][0]
    collected: list = []
    after = None
    while len(collected) < limit:
        params = {"limit": min(100, limit - len(collected)), "properties": ",".join(properties)}
        if after:
            params["after"] = after
        payload = connector._get(credentials, f"/crm/v3/objects/{source_id}", params)
        batch = payload.get("results", [])
        collected.extend(batch)
        after = (payload.get("paging") or {}).get("next", {}).get("after")
        if not after or not batch:
            break
    return collected


if __name__ == "__main__":
    sys.exit(main())
