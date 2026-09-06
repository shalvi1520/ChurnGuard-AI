"""
Shared constants ported from final_ml_shap.ipynb. Kept in one place so
feature_engineering.py, predictor.py, explainer.py, and train_and_export.py
all agree on the same values the notebook used.
"""
import os

RANDOM_STATE = 42
TARGET_COL = "Churn Value"
TARGET_RECALL = 0.75

# Notebook Cell 3
LEAKAGE_AND_ID_COLS = [
    "CustomerID", "Count", "Country", "State", "City", "Zip Code",
    "Lat Long", "Latitude", "Longitude",
    "Churn Label", "Churn Score", "Churn Reason",
    "CLTV",  # computed from churn-related signals in this dataset -- leakage
]

# Notebook Cell 4
SERVICE_COLS = [
    "Online Security", "Online Backup", "Device Protection",
    "Tech Support", "Streaming TV", "Streaming Movies",
]

# Notebook Cell 8
BACKGROUND_KMEANS_K = 15
SHAP_NSAMPLES_DEFAULT = 50
SHAP_SEED_DEFAULT = 42

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
ARTIFACTS_DIR = os.path.join(BACKEND_DIR, "artifacts")
