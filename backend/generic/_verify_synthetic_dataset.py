"""
Builds the synthetic "SaaS subscription churn" dataset from the plan's
verification section -- deliberately not a Telco-shaped dataset, and
deliberately exercises every robustness path: id-like, datetime, constant,
all-null, high-cardinality, rare category, missing numeric values, and a
string target. Used only for verification, not part of the shipped package.
"""
import numpy as np
import pandas as pd


def build_saas_churn_dataset(n: int = 300, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    n_churn = int(n * 0.15)
    n_stay = n - n_churn
    churned = np.array(["Yes"] * n_churn + ["No"] * n_stay)
    rng.shuffle(churned)

    subscriber_id = [f"SUB-{i:05d}" for i in range(n)]
    signup_date = pd.to_datetime("2023-01-01") + pd.to_timedelta(rng.integers(0, 700, size=n), unit="D")
    plan_tier = rng.choice(["Free", "Pro", "Enterprise"], size=n, p=[0.5, 0.35, 0.15])

    # region: one level ("APAC") deliberately rare (1-2 occurrences)
    region = rng.choice(["NA", "EU"], size=n, p=[0.6, 0.4]).astype(object)
    rare_idx = rng.choice(n, size=2, replace=False)
    region[rare_idx] = "APAC"

    auto_renew = rng.choice(["Yes", "No"], size=n)

    monthly_spend = np.round(rng.normal(50, 20, size=n).clip(5, 300), 2)
    num_logins_last_30d = rng.integers(0, 60, size=n).astype(float)
    support_tickets_opened = rng.integers(0, 10, size=n)
    nps_score = rng.integers(0, 11, size=n).astype(float)
    contract_length_months = rng.choice([1, 6, 12, 24], size=n)

    # inject NaNs into some numeric columns
    nan_idx_logins = rng.choice(n, size=int(n * 0.08), replace=False)
    num_logins_last_30d[nan_idx_logins] = np.nan
    nan_idx_nps = rng.choice(n, size=int(n * 0.1), replace=False)
    nps_score[nan_idx_nps] = np.nan

    country = ["US"] * n  # constant column, must be auto-dropped
    notes = [np.nan] * n  # all-null column, must be auto-dropped
    free_text_comment = [f"comment about the product number {rng.integers(0, 1_000_000)}" for _ in range(n)]

    df = pd.DataFrame(
        {
            "subscriber_id": subscriber_id,
            "signup_date": signup_date,
            "plan_tier": plan_tier,
            "region": region,
            "auto_renew": auto_renew,
            "monthly_spend": monthly_spend,
            "num_logins_last_30d": num_logins_last_30d,
            "support_tickets_opened": support_tickets_opened,
            "nps_score": nps_score,
            "contract_length_months": contract_length_months,
            "country": country,
            "notes": notes,
            "free_text_comment": free_text_comment,
            "churned": churned,
        }
    )
    return df


if __name__ == "__main__":
    df = build_saas_churn_dataset()
    print(df.shape)
    print(df.dtypes)
    print(df["churned"].value_counts())
