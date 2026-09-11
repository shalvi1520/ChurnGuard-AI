"""
Identifies a training dataframe by its actual content, not its filename or
upload time: same columns, same dtypes, same row count, same values ->
same fingerprint. Used to recognise "we've already trained this exact data"
so reconnecting it doesn't mean paying for another Optuna-tuned stacking fit
-- see backend/api/dataset_routes.py's run_prediction() and
backend/db/models.py's TrainedModel.
"""
import hashlib

import pandas as pd


def compute_fingerprint(train_df: pd.DataFrame) -> str:
    """`train_df` should be the exact frame about to be handed to the
    trainer (mapped fields + extras, post-cleaning, target column included)
    -- fingerprinting anything less specific risks a false cache hit."""
    columns_sig = "|".join(f"{c}:{train_df[c].dtype}" for c in sorted(train_df.columns))
    content_hash = pd.util.hash_pandas_object(train_df, index=False).sum()
    raw = f"{columns_sig}|rows={len(train_df)}|content={content_hash}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
