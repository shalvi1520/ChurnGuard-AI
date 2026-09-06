"""
CSV/XLSX loading for the generic pipeline, with keep_default_na=False.

Unlike the Telco pipeline (whose categorical values are things like
"Yes"/"No"/"Month-to-month"), a cross-vertical generic dataset can
plausibly use values like "NA" (e.g. North America), "NULL", "N/A", or
"None" as legitimate category labels -- pandas' default na_values list
would silently swallow those into missing values on CSV/XLSX read, which
is a real data-correctness bug for this pipeline specifically. Genuine
missing values are still handled by the trainer's own imputation step.
"""
import io

import pandas as pd


def load_dataset_from_path(path: str) -> pd.DataFrame:
    if path.endswith(".csv"):
        return pd.read_csv(path, keep_default_na=False, na_values=[""])
    if path.endswith((".xlsx", ".xls")):
        return pd.read_excel(path, keep_default_na=False, na_values=[""])
    raise ValueError("Please provide a .csv, .xlsx, or .xls file")


def load_dataset_from_bytes(filename: str, contents: bytes) -> pd.DataFrame:
    name = (filename or "").lower()
    buffer = io.BytesIO(contents)
    if name.endswith(".csv"):
        return pd.read_csv(buffer, keep_default_na=False, na_values=[""])
    if name.endswith((".xlsx", ".xls")):
        return pd.read_excel(buffer, keep_default_na=False, na_values=[""])
    raise ValueError("Please upload a .csv, .xlsx, or .xls file")
