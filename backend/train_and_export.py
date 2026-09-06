"""
Training/export script -- ports final_ml_shap.ipynb Cells 1-8 (minus the
Colab file-upload widget, replaced with a --data path argument) into a
runnable script. Saves model.joblib, scaler.joblib, encoders.joblib,
background_kmeans.joblib, and metadata.joblib into backend/artifacts/.

Run from the project root:
    python -m backend.train_and_export --data "Telco_customer_churn.xlsx"

Note: the notebook's Optuna study does not fix a sampler seed, so
re-running this script can tune slightly different LightGBM
hyperparameters (and therefore a slightly different model) each time --
this is preserved as-is, not seeded, per the notebook's original behavior.
"""
import argparse
import warnings

import lightgbm as lgb
import optuna
import pandas as pd
import shap
from catboost import CatBoostClassifier
from imblearn.over_sampling import SMOTE
from sklearn.ensemble import StackingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler

from . import artifacts, config
from .feature_engineering import engineer_features

warnings.filterwarnings("ignore")
optuna.logging.set_verbosity(optuna.logging.WARNING)


def load_dataset(path: str) -> pd.DataFrame:
    if path.endswith(".csv"):
        return pd.read_csv(path)
    if path.endswith((".xlsx", ".xls")):
        return pd.read_excel(path)
    raise ValueError("Please provide a .csv, .xlsx, or .xls file")


def run(data_path: str) -> None:
    df = load_dataset(data_path)
    print(f"Loaded {df.shape[0]} rows, {df.shape[1]} columns")

    data = engineer_features(df)
    print(f"After leakage-drop + feature engineering: {data.shape}")

    cat_cols = data.select_dtypes(include=["object", "category"]).columns.tolist()
    cat_cols = [c for c in cat_cols if c != config.TARGET_COL]

    encoders = {}
    for col in cat_cols:
        le = LabelEncoder()
        data[col] = le.fit_transform(data[col].astype(str))
        encoders[col] = le

    X = data.drop(columns=[config.TARGET_COL])
    y = data[config.TARGET_COL].astype(int)

    X_train, X_temp, y_train, y_temp = train_test_split(
        X, y, test_size=0.30, stratify=y, random_state=config.RANDOM_STATE
    )
    X_val, X_test, y_val, y_test = train_test_split(
        X_temp, y_temp, test_size=0.50, stratify=y_temp, random_state=config.RANDOM_STATE
    )

    scaler = StandardScaler()
    X_train_scaled = pd.DataFrame(scaler.fit_transform(X_train), columns=X_train.columns, index=X_train.index)
    X_val_scaled = pd.DataFrame(scaler.transform(X_val), columns=X_val.columns, index=X_val.index)
    X_test_scaled = pd.DataFrame(scaler.transform(X_test), columns=X_test.columns, index=X_test.index)

    smote = SMOTE(random_state=config.RANDOM_STATE)
    X_train_bal, y_train_bal = smote.fit_resample(X_train_scaled, y_train)
    print("Train (balanced):", X_train_bal.shape, " Val:", X_val_scaled.shape, " Test:", X_test_scaled.shape)

    def objective(trial):
        params = {
            "n_estimators": trial.suggest_int("n_estimators", 200, 600),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.1, log=True),
            "num_leaves": trial.suggest_int("num_leaves", 15, 63),
            "max_depth": trial.suggest_int("max_depth", 3, 10),
            "min_child_samples": trial.suggest_int("min_child_samples", 10, 50),
            "class_weight": "balanced",
            "random_state": config.RANDOM_STATE,
            "verbosity": -1,
        }
        clf = lgb.LGBMClassifier(**params)
        clf.fit(X_train_bal, y_train_bal)
        proba = clf.predict_proba(X_val_scaled)[:, 1]
        return roc_auc_score(y_val, proba)

    print("Tuning LightGBM hyperparameters (this takes a minute)...")
    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=30, show_progress_bar=False)
    print(f"Best validation AUC found: {study.best_value:.3f}")
    print(f"Best params: {study.best_params}")

    lgbm_clf = lgb.LGBMClassifier(
        **study.best_params, class_weight="balanced", random_state=config.RANDOM_STATE, verbosity=-1
    )
    cat_clf = CatBoostClassifier(
        iterations=400, learning_rate=0.03, depth=6,
        auto_class_weights="Balanced", verbose=0, random_state=config.RANDOM_STATE,
    )
    model = StackingClassifier(
        estimators=[("lgbm", lgbm_clf), ("catboost", cat_clf)],
        final_estimator=LogisticRegression(max_iter=1000),
        cv=StratifiedKFold(n_splits=5, shuffle=True, random_state=config.RANDOM_STATE),
        stack_method="predict_proba",
        n_jobs=-1,
    )
    print("Training final stacked ensemble...")
    model.fit(X_train_bal, y_train_bal)
    print("Done.")

    y_val_proba = model.predict_proba(X_val_scaled)[:, 1]
    precisions, recalls, thresholds = precision_recall_curve(y_val, y_val_proba)
    precisions, recalls = precisions[:-1], recalls[:-1]
    candidates = [(t, p, r) for p, r, t in zip(precisions, recalls, thresholds) if r >= config.TARGET_RECALL]
    best_thresh, best_prec, best_rec = max(candidates, key=lambda x: x[1]) if candidates else (0.5, None, None)
    print(f"Tuned threshold (validation) = {best_thresh:.3f}")

    y_test_proba = model.predict_proba(X_test_scaled)[:, 1]
    y_test_pred = (y_test_proba >= best_thresh).astype(int)

    print("=== FINAL RESULTS - TEST set ===")
    print(f"Accuracy : {accuracy_score(y_test, y_test_pred):.3f}")
    print(f"Precision: {precision_score(y_test, y_test_pred):.3f}")
    print(f"Recall   : {recall_score(y_test, y_test_pred):.3f}")
    print(f"F1-score : {f1_score(y_test, y_test_pred):.3f}")
    print(f"AUC-ROC  : {roc_auc_score(y_test, y_test_proba):.3f}")
    print("\nConfusion Matrix:\n", confusion_matrix(y_test, y_test_pred))
    print("\nFull report:\n", classification_report(y_test, y_test_pred, target_names=["Retained", "Churned"]))

    background_kmeans = shap.kmeans(X_train_scaled, config.BACKGROUND_KMEANS_K)

    metadata = {
        "feature_columns": list(X_train_scaled.columns),
        "threshold": float(best_thresh),
        "target_col": config.TARGET_COL,
    }

    artifacts.save_artifacts(model, scaler, encoders, background_kmeans, metadata)
    print(f"\nSaved artifacts to {config.ARTIFACTS_DIR}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train and export the ChurnGuard model pipeline")
    parser.add_argument("--data", required=True, help="Path to the Telco churn CSV/XLSX file")
    args = parser.parse_args()
    run(args.data)
