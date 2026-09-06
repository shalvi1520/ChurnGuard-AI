"""
Pure, dependency-free preprocessing primitives shared by trainer.py
(train-time) and predictor.py (inference-time) so the two paths can never
silently drift apart. No model training happens here.
"""
from typing import Any, Optional

import numpy as np
import pandas as pd
from imblearn.over_sampling import SMOTE, SMOTEN, SMOTENC
from sklearn.preprocessing import LabelEncoder

from . import config


def split_column_types(df: pd.DataFrame, exclude: Optional[list] = None):
    """dtype-based bucketing: datetime64 -> its own bucket; object/category
    -> categorical; everything else (bool/int/float) -> numeric."""
    exclude_set = set(exclude or [])
    numeric_cols, categorical_cols, datetime_cols = [], [], []
    for col in df.columns:
        if col in exclude_set:
            continue
        dtype = df[col].dtype
        if pd.api.types.is_datetime64_any_dtype(dtype):
            datetime_cols.append(col)
        elif pd.api.types.is_object_dtype(dtype) or isinstance(dtype, pd.CategoricalDtype):
            categorical_cols.append(col)
        else:
            numeric_cols.append(col)
    return numeric_cols, categorical_cols, datetime_cols


def find_id_like_columns(df: pd.DataFrame, exclude: Optional[list] = None) -> list:
    """Continuous numeric (float) columns are excluded: near-100% uniqueness
    is a natural property of continuous data, not an identifier signal, so
    applying this check to them would silently drop real numeric features
    (e.g. a monthly-spend column with fine-grained decimals). Sequential
    integer IDs and string/categorical identifiers are still caught."""
    exclude_set = set(exclude or [])
    n = len(df)
    if n == 0:
        return []
    result = []
    for col in df.columns:
        if col in exclude_set or pd.api.types.is_float_dtype(df[col].dtype):
            continue
        if (df[col].nunique(dropna=True) / n) >= config.ID_LIKE_UNIQUENESS_RATIO:
            result.append(col)
    return result


def find_constant_columns(df: pd.DataFrame, exclude: Optional[list] = None) -> list:
    """nunique() <= 1 covers all-null columns too (nunique excludes NaN, so
    an all-null column has nunique()==0)."""
    exclude_set = set(exclude or [])
    return [
        col for col in df.columns
        if col not in exclude_set and df[col].nunique(dropna=True) <= config.CONSTANT_COLUMN_MAX_UNIQUE
    ]


def find_high_cardinality_categoricals(df: pd.DataFrame, categorical_cols: list) -> list:
    n = len(df)
    if n == 0:
        return []
    result = []
    for col in categorical_cols:
        nunique = df[col].nunique(dropna=True)
        if nunique >= config.HIGH_CARDINALITY_MIN_UNIQUE and (nunique / n) >= config.HIGH_CARDINALITY_RATIO:
            result.append(col)
    return result


def compute_numeric_medians(df: pd.DataFrame, numeric_cols: list) -> dict:
    return {col: float(df[col].median()) for col in numeric_cols if col in df.columns}


def impute_numeric(df: pd.DataFrame, medians: dict) -> pd.DataFrame:
    data = df.copy()
    for col, median in medians.items():
        if col in data.columns:
            data[col] = pd.to_numeric(data[col], errors="coerce").fillna(median)
    return data


def impute_categorical(df: pd.DataFrame, categorical_cols: list, placeholder: str) -> pd.DataFrame:
    """fillna happens before astype(str) so a missing value becomes the
    placeholder, not the literal string 'nan'."""
    data = df.copy()
    for col in categorical_cols:
        if col in data.columns:
            data[col] = data[col].fillna(placeholder).astype(str)
    return data


def fit_label_encoders(df: pd.DataFrame, categorical_cols: list, placeholder: str) -> dict:
    """Fits each encoder on the train split's values plus the placeholder,
    even if train happens to contain no missing values for that column --
    guarantees a later inference-time null always has a known class."""
    encoders = {}
    for col in categorical_cols:
        values = df[col].astype(str).tolist()
        values.append(placeholder)
        le = LabelEncoder()
        le.fit(values)
        encoders[col] = le
    return encoders


def encode_categoricals_strict(df: pd.DataFrame, encoders: dict) -> pd.DataFrame:
    """Fail-loud contract used for the train split and for every real
    predict/explain call: unseen value -> ValueError naming column + value."""
    data = df.copy()
    for col, encoder in encoders.items():
        if col not in data.columns:
            raise ValueError(f"Missing expected column '{col}' required for encoding.")
        values = data[col].astype(str)
        unseen = sorted(set(values) - set(encoder.classes_))
        if unseen:
            raise ValueError(
                f"Unknown value(s) {unseen} for column '{col}'. "
                f"Known values: {sorted(encoder.classes_.tolist())}"
            )
        data[col] = encoder.transform(values)
    return data


def encode_categoricals_lenient(df: pd.DataFrame, encoders: dict, unseen_code: int = -1) -> pd.DataFrame:
    """Training-internal only: a rare categorical level landing in val/test
    but not train maps to a sentinel instead of crashing training. Never
    used for real predict/explain traffic, never persisted."""
    data = df.copy()
    for col, encoder in encoders.items():
        if col not in data.columns:
            continue
        mapping = {cls: idx for idx, cls in enumerate(encoder.classes_)}
        data[col] = data[col].astype(str).map(mapping).fillna(unseen_code).astype(int)
    return data


def select_and_order_features(df: pd.DataFrame, feature_columns: list) -> pd.DataFrame:
    missing = [c for c in feature_columns if c not in df.columns]
    if missing:
        raise ValueError(f"Missing expected feature column(s): {missing}")
    return df[feature_columns]


def categorical_feature_indices(feature_columns: list, categorical_cols: list) -> list:
    cat_set = set(categorical_cols)
    return [i for i, col in enumerate(feature_columns) if col in cat_set]


def choose_oversampler(
    numeric_cols: list,
    categorical_cols: list,
    categorical_indices: list,
    k_neighbors: int,
    random_state: int,
) -> Any:
    """Picks the categorical-aware oversampler matching whatever column
    mix actually survived preprocessing -- SMOTENC never interpolates a
    fractional value for a categorical (LabelEncoded) column, unlike
    plain SMOTE."""
    if numeric_cols and categorical_cols:
        return SMOTENC(categorical_features=categorical_indices, k_neighbors=k_neighbors, random_state=random_state)
    if categorical_cols and not numeric_cols:
        return SMOTEN(k_neighbors=k_neighbors, random_state=random_state)
    return SMOTE(k_neighbors=k_neighbors, random_state=random_state)
