"""
Settings for the generic (cross-vertical) tabular churn pipeline. Reuses
domain-agnostic constants from backend/config.py rather than duplicating
them; defines its own artifacts directory and the robustness gates the
fixed-shape Telco pipeline never needed.
"""
import os

from .. import config as base_config

RANDOM_STATE = base_config.RANDOM_STATE
BACKGROUND_KMEANS_K = base_config.BACKGROUND_KMEANS_K
SHAP_NSAMPLES_DEFAULT = base_config.SHAP_NSAMPLES_DEFAULT
SHAP_SEED_DEFAULT = base_config.SHAP_SEED_DEFAULT

DEFAULT_TARGET_RECALL = 0.75
DEFAULT_N_TRIALS = 30
DEFAULT_IMBALANCE_STRATEGY = "smote"
IMBALANCE_STRATEGIES = ("smote", "class_weight", "both", "none")

CATEGORICAL_MISSING_PLACEHOLDER = "__MISSING__"

GENERIC_DIR = os.path.dirname(os.path.abspath(__file__))
ARTIFACTS_DIR = os.path.join(GENERIC_DIR, "artifacts")

# Robustness gates -- none of these exist in the Telco script because
# Telco's shape/size was fixed and known in advance.
MIN_ROWS_REQUIRED = 20
MIN_MINORITY_CLASS_COUNT = 6
ID_LIKE_UNIQUENESS_RATIO = 1.0
CONSTANT_COLUMN_MAX_UNIQUE = 1
HIGH_CARDINALITY_MIN_UNIQUE = 50
HIGH_CARDINALITY_RATIO = 0.5
SMOTE_DEFAULT_K_NEIGHBORS = 5

LEAKAGE_LIMITATION_WARNING = (
    "This pipeline cannot detect domain-specific semantic leakage (e.g. a column "
    "that is itself derived from the churn label) -- only generic dtype/cardinality "
    "heuristics (id-like, constant, all-null, high-cardinality, datetime) are applied. "
    "Use extra_drop_cols to remove any column you know leaks the label."
)
