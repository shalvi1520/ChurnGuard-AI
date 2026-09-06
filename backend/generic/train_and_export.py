"""
CLI for the generic cross-vertical churn pipeline.

Run from the project root:
    python -m backend.generic.train_and_export --data path/to/data.csv \
        --target-col "Churned" [--target-recall 0.75] [--drop-cols "colA,colB"] \
        [--positive-label "Yes"] [--n-trials 30] [--imbalance-strategy smote]

Note: uses this package's own io_utils.load_dataset_from_path() rather
than backend.train_and_export.load_dataset() -- the generic pipeline needs
keep_default_na=False (a cross-vertical dataset can legitimately use
values like "NA"/"N/A"/"NULL" as real category labels, not missing-value
markers, unlike Telco's fixed schema). See io_utils.py for details.
"""
import argparse
import json

from . import config, trainer
from .io_utils import load_dataset_from_path


def _parse_drop_cols(value):
    if not value:
        return None
    return [c.strip() for c in value.split(",") if c.strip()]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train and export the generic churn pipeline")
    parser.add_argument("--data", required=True, help="Path to the CSV/XLSX dataset")
    parser.add_argument("--target-col", required=True, help="Name of the binary churn/target column")
    parser.add_argument("--target-recall", type=float, default=config.DEFAULT_TARGET_RECALL)
    parser.add_argument("--drop-cols", default=None, help="Comma-separated known leakage/ID columns to drop")
    parser.add_argument("--positive-label", default=None, help="Which raw label value means churn/positive")
    parser.add_argument("--n-trials", type=int, default=config.DEFAULT_N_TRIALS)
    parser.add_argument(
        "--imbalance-strategy", default=config.DEFAULT_IMBALANCE_STRATEGY, choices=list(config.IMBALANCE_STRATEGIES)
    )
    args = parser.parse_args()

    df = load_dataset_from_path(args.data)
    report = trainer.train_generic_model(
        df,
        target_col=args.target_col,
        target_recall=args.target_recall,
        extra_drop_cols=_parse_drop_cols(args.drop_cols),
        positive_label=args.positive_label,
        n_trials=args.n_trials,
        imbalance_strategy=args.imbalance_strategy,
    )
    print(json.dumps(report, indent=2, default=str))
