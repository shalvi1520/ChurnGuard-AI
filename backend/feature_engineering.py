"""
Ports final_ml_shap.ipynb Cells 3-4: drop leakage/ID columns and duplicate
rows, then engineer the same features the notebook adds
(Avg_Monthly_Spend, Charge_Spike, Tenure_Bucket, Num_Services,
Is_Month_to_Month). No encoding, scaling, or splitting happens here --
that stays in predictor.py / train_and_export.py.
"""
import pandas as pd

from . import config


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Takes a raw customer DataFrame and returns the engineered one."""
    data = df.drop(columns=[c for c in config.LEAKAGE_AND_ID_COLS if c in df.columns])
    data = data.drop_duplicates()
    data = data.copy()

    data["Total Charges"] = pd.to_numeric(data["Total Charges"], errors="coerce").fillna(0)
    data["Avg_Monthly_Spend"] = data["Total Charges"] / data["Tenure Months"].replace(0, 1)
    data["Charge_Spike"] = data["Monthly Charges"] - data["Avg_Monthly_Spend"]
    data["Tenure_Bucket"] = pd.cut(
        data["Tenure Months"], bins=[-1, 6, 12, 24, 48, 100],
        labels=["0-6mo", "6-12mo", "1-2yr", "2-4yr", "4yr+"],
    )

    service_cols = [c for c in config.SERVICE_COLS if c in data.columns]
    data["Num_Services"] = (data[service_cols] == "Yes").sum(axis=1)

    if "Contract" in data.columns:
        data["Is_Month_to_Month"] = (data["Contract"] == "Month-to-month").astype(int)

    return data
