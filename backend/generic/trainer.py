"""
Trains the generic cross-vertical churn pipeline: same core architecture
as the Telco script (Optuna-tuned LightGBM + CatBoost stacking +
LogisticRegression meta-learner, PR-curve threshold tuning), but with the
robustness a genuinely variable-shape/size input requires -- adaptive
splitting, categorical-aware oversampling (SMOTENC/SMOTEN/SMOTE) behind a
caller-configurable imbalance_strategy, and no invented domain-specific
feature engineering. See the "generic tabular churn pipeline" plan for the
full design rationale.
"""
import datetime
from typing import Any, Optional

import lightgbm as lgb
import numpy as np
import optuna
import pandas as pd
import shap
from catboost import CatBoostClassifier
from sklearn.ensemble import StackingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.preprocessing import StandardScaler

from . import artifacts, config, preprocessing as prep

optuna.logging.set_verbosity(optuna.logging.WARNING)


def validate_and_clean_target(df: pd.DataFrame, target_col: str) -> tuple:
    if target_col not in df.columns:
        raise ValueError(f"Target column '{target_col}' not found in dataset.")

    warnings = []
    null_mask = df[target_col].isna()
    if null_mask.any():
        warnings.append(f"Dropped {int(null_mask.sum())} row(s) with a null target value.")
    cleaned = df.loc[~null_mask].copy()

    unique_values = cleaned[target_col].unique().tolist()
    if len(unique_values) != 2:
        raise ValueError(
            f"Target column '{target_col}' must be binary; found {len(unique_values)} "
            f"unique value(s): {unique_values}"
        )
    return cleaned, warnings


def choose_positive_label(y_raw: pd.Series, positive_label: Any = None) -> tuple:
    observed = y_raw.unique().tolist()
    if positive_label is not None:
        if positive_label not in observed:
            raise ValueError(f"positive_label {positive_label!r} not found among observed values: {observed}")
        other = [v for v in observed if v != positive_label][0]
        return positive_label, other

    counts = y_raw.value_counts()
    positive = counts.idxmin()
    other = [v for v in observed if v != positive][0]
    return positive, other


def train_generic_model(
    df: pd.DataFrame,
    target_col: str,
    target_recall: float = config.DEFAULT_TARGET_RECALL,
    extra_drop_cols: Optional[list] = None,
    positive_label: Any = None,
    n_trials: int = config.DEFAULT_N_TRIALS,
    imbalance_strategy: str = config.DEFAULT_IMBALANCE_STRATEGY,
    fingerprint: Optional[str] = None,
) -> dict:
    warnings: list = [config.LEAKAGE_LIMITATION_WARNING]

    if imbalance_strategy not in config.IMBALANCE_STRATEGIES:
        raise ValueError(
            f"Invalid imbalance_strategy {imbalance_strategy!r}. "
            f"Valid choices: {list(config.IMBALANCE_STRATEGIES)}"
        )

    cleaned, target_warnings = validate_and_clean_target(df, target_col)
    warnings.extend(target_warnings)

    if len(cleaned) < config.MIN_ROWS_REQUIRED:
        raise ValueError(
            f"Dataset has {len(cleaned)} row(s) after cleaning; "
            f"at least {config.MIN_ROWS_REQUIRED} are required."
        )

    y_raw = cleaned[target_col]
    positive_label, negative_label = choose_positive_label(y_raw, positive_label)
    y = (y_raw == positive_label).astype(int)

    minority_count = int(y.value_counts().min())
    if minority_count < config.MIN_MINORITY_CLASS_COUNT:
        raise ValueError(
            f"Minority class has only {minority_count} row(s); "
            f"at least {config.MIN_MINORITY_CLASS_COUNT} are required to train reliably."
        )

    # --- drop set: target + caller-supplied leakage cols + generic heuristics ---
    extra_drop_cols = extra_drop_cols or []
    present_extra_drops = [c for c in extra_drop_cols if c in cleaned.columns]
    missing_extra_drops = [c for c in extra_drop_cols if c not in cleaned.columns]
    if missing_extra_drops:
        warnings.append(f"extra_drop_cols not found in dataset (ignored): {missing_extra_drops}")

    X = cleaned.drop(columns=[target_col] + present_extra_drops)

    _, prelim_categorical, prelim_datetime = prep.split_column_types(X)
    id_like = prep.find_id_like_columns(X)
    constant = prep.find_constant_columns(X)
    high_card = prep.find_high_cardinality_categoricals(X, prelim_categorical)

    dropped_columns = {
        "explicit": present_extra_drops,
        "id_like": id_like,
        "constant_or_all_null": constant,
        "datetime": prelim_datetime,
        "high_cardinality_categorical": high_card,
    }
    auto_drop = set(id_like) | set(constant) | set(prelim_datetime) | set(high_card)
    X = X.drop(columns=list(auto_drop))

    if prelim_datetime:
        warnings.append(
            f"Datetime column(s) dropped (not converted to a numeric feature in v1): {prelim_datetime}"
        )

    numeric_cols, categorical_cols, _ = prep.split_column_types(X)
    if not numeric_cols and not categorical_cols:
        raise ValueError("No usable feature columns remain after dropping leakage/ID/constant/datetime columns.")

    # --- adaptive stratified 70/15/15 split ---
    try:
        X_train, X_temp, y_train, y_temp = train_test_split(
            X, y, test_size=0.30, stratify=y, random_state=config.RANDOM_STATE
        )
        X_val, X_test, y_val, y_test = train_test_split(
            X_temp, y_temp, test_size=0.50, stratify=y_temp, random_state=config.RANDOM_STATE
        )
    except ValueError as exc:
        raise ValueError(
            f"Could not create a stratified train/val/test split ({exc}). "
            "The minority class count is too small for a stable 3-way split -- "
            f">= {config.MIN_MINORITY_CLASS_COUNT} is the hard floor to attempt one at all, "
            "but >=15-20 is recommended for a stable val/test split."
        ) from exc

    # --- fit preprocessing on TRAIN split only ---
    medians = prep.compute_numeric_medians(X_train, numeric_cols)
    X_train_imp = prep.impute_categorical(prep.impute_numeric(X_train, medians), categorical_cols, config.CATEGORICAL_MISSING_PLACEHOLDER)
    X_val_imp = prep.impute_categorical(prep.impute_numeric(X_val, medians), categorical_cols, config.CATEGORICAL_MISSING_PLACEHOLDER)
    X_test_imp = prep.impute_categorical(prep.impute_numeric(X_test, medians), categorical_cols, config.CATEGORICAL_MISSING_PLACEHOLDER)

    encoders = prep.fit_label_encoders(X_train_imp, categorical_cols, config.CATEGORICAL_MISSING_PLACEHOLDER)
    X_train_enc = prep.encode_categoricals_strict(X_train_imp, encoders)
    X_val_enc = prep.encode_categoricals_lenient(X_val_imp, encoders)
    X_test_enc = prep.encode_categoricals_lenient(X_test_imp, encoders)

    for col in categorical_cols:
        n_unseen = int((X_val_enc[col] == -1).sum() + (X_test_enc[col] == -1).sum())
        if n_unseen:
            warnings.append(
                f"Column '{col}' had {n_unseen} value(s) in the val/test split(s) not seen "
                "during training; treated as unseen for evaluation only (never for real "
                "predict/explain traffic, which fails loudly on unseen categories)."
            )

    feature_columns = list(X_train_enc.columns)
    X_train_enc = X_train_enc[feature_columns]
    X_val_enc = X_val_enc[feature_columns]
    X_test_enc = X_test_enc[feature_columns]

    # --- imbalance handling: oversample BEFORE scaling (unscaled/encoded space) ---
    oversampler_used = None
    smote_k_neighbors_used = None
    if imbalance_strategy in ("smote", "both"):
        minority_train = int(y_train.value_counts().min())
        k = min(config.SMOTE_DEFAULT_K_NEIGHBORS, minority_train - 1)
        if k < 1:
            warnings.append(
                f"Minority class has only {minority_train} member(s) in the training split; "
                "oversampling skipped, training on the natural class balance."
            )
            X_train_bal, y_train_bal = X_train_enc, y_train
        else:
            cat_indices = prep.categorical_feature_indices(feature_columns, categorical_cols)
            oversampler = prep.choose_oversampler(numeric_cols, categorical_cols, cat_indices, k, config.RANDOM_STATE)
            oversampler_used = type(oversampler).__name__
            smote_k_neighbors_used = k
            X_train_bal, y_train_bal = oversampler.fit_resample(X_train_enc, y_train)
            X_train_bal = pd.DataFrame(X_train_bal, columns=feature_columns)
    else:
        X_train_bal, y_train_bal = X_train_enc, y_train

    # --- scale: fit on pre-oversampling real train rows only ---
    scaler = StandardScaler()
    scaler.fit(X_train_enc)
    X_train_scaled = pd.DataFrame(scaler.transform(X_train_bal), columns=feature_columns, index=X_train_bal.index if hasattr(X_train_bal, "index") else None)
    X_val_scaled = pd.DataFrame(scaler.transform(X_val_enc), columns=feature_columns, index=X_val_enc.index)
    X_test_scaled = pd.DataFrame(scaler.transform(X_test_enc), columns=feature_columns, index=X_test_enc.index)

    class_weight_applied = imbalance_strategy in ("class_weight", "both")
    lgbm_class_weight = "balanced" if class_weight_applied else None
    catboost_class_weights = "Balanced" if class_weight_applied else None

    # --- Optuna LightGBM tuning: seeded sampler, size-aware search-space caps ---
    n_train_bal = len(X_train_scaled)
    min_child_samples_upper = min(50, max(2, n_train_bal // 10))
    num_leaves_upper = min(63, max(4, n_train_bal // 5))

    def objective(trial):
        params = {
            "n_estimators": trial.suggest_int("n_estimators", 200, 600),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.1, log=True),
            "num_leaves": trial.suggest_int("num_leaves", 4, max(5, num_leaves_upper)),
            "max_depth": trial.suggest_int("max_depth", 3, 10),
            "min_child_samples": trial.suggest_int("min_child_samples", 2, max(3, min_child_samples_upper)),
            "class_weight": lgbm_class_weight,
            "random_state": config.RANDOM_STATE,
            "verbosity": -1,
        }
        clf = lgb.LGBMClassifier(**params)
        clf.fit(X_train_scaled, y_train_bal)
        proba = clf.predict_proba(X_val_scaled)[:, 1]
        return roc_auc_score(y_val, proba)

    sampler = optuna.samplers.TPESampler(seed=config.RANDOM_STATE)
    study = optuna.create_study(direction="maximize", sampler=sampler)
    study.optimize(objective, n_trials=n_trials, show_progress_bar=False)

    lgbm_clf = lgb.LGBMClassifier(
        **study.best_params, class_weight=lgbm_class_weight, random_state=config.RANDOM_STATE, verbosity=-1
    )
    cat_clf = CatBoostClassifier(
        iterations=400, learning_rate=0.03, depth=6,
        auto_class_weights=catboost_class_weights, verbose=0, random_state=config.RANDOM_STATE,
    )

    cv_splits_used = max(2, min(5, int(y_train_bal.value_counts().min())))
    if cv_splits_used < 5:
        warnings.append(f"Stacking classifier used {cv_splits_used} CV folds instead of 5 due to a small minority class.")

    model = StackingClassifier(
        estimators=[("lgbm", lgbm_clf), ("catboost", cat_clf)],
        final_estimator=LogisticRegression(max_iter=1000),
        cv=StratifiedKFold(n_splits=cv_splits_used, shuffle=True, random_state=config.RANDOM_STATE),
        stack_method="predict_proba",
        n_jobs=-1,
    )
    model.fit(X_train_scaled, y_train_bal)

    # --- threshold tuning on val, evaluation on test ---
    y_val_proba = model.predict_proba(X_val_scaled)[:, 1]
    precisions, recalls, thresholds = precision_recall_curve(y_val, y_val_proba)
    precisions, recalls = precisions[:-1], recalls[:-1]
    candidates = [(t, p, r) for p, r, t in zip(precisions, recalls, thresholds) if r >= target_recall]
    if candidates:
        best_thresh, _, _ = max(candidates, key=lambda x: x[1])
    else:
        best_thresh = 0.5
        warnings.append(f"No threshold cleared target_recall={target_recall}; falling back to 0.5.")

    y_test_proba = model.predict_proba(X_test_scaled)[:, 1]
    y_test_pred = (y_test_proba >= best_thresh).astype(int)
    test_metrics = {
        "accuracy": float(accuracy_score(y_test, y_test_pred)),
        "precision": float(precision_score(y_test, y_test_pred, zero_division=0)),
        "recall": float(recall_score(y_test, y_test_pred, zero_division=0)),
        "f1": float(f1_score(y_test, y_test_pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_test, y_test_proba)),
        "confusion_matrix": confusion_matrix(y_test, y_test_pred).tolist(),
    }
    val_metrics = {"roc_auc": float(roc_auc_score(y_val, y_val_proba))}

    # shap.kmeans/sklearn's KMeans can find fewer distinct clusters than
    # requested when the training data has few unique rows (common on small
    # or low-cardinality-only datasets), which shap.kmeans doesn't handle
    # gracefully -- cap k to the number of distinct rows available.
    n_unique_rows = len(X_train_scaled.drop_duplicates())
    background_k = min(config.BACKGROUND_KMEANS_K, len(X_train_scaled), n_unique_rows)
    background_kmeans = shap.kmeans(X_train_scaled, background_k)

    metadata = {
        "target_col": target_col,
        "positive_label": positive_label,
        "negative_label": negative_label,
        "feature_columns": feature_columns,
        "numeric_cols": numeric_cols,
        "categorical_cols": categorical_cols,
        "numeric_medians": medians,
        "categorical_placeholder": config.CATEGORICAL_MISSING_PLACEHOLDER,
        "dropped_columns": dropped_columns,
        "threshold": float(best_thresh),
        "imbalance_strategy": imbalance_strategy,
        "oversampler_used": oversampler_used,
        "smote_k_neighbors_used": smote_k_neighbors_used,
        "class_weight_applied": class_weight_applied,
        "cv_splits_used": cv_splits_used,
        "best_lgbm_params": study.best_params,
        "val_metrics": val_metrics,
        "test_metrics": test_metrics,
        "trained_at": datetime.datetime.utcnow().isoformat(),
        "warnings": warnings,
    }

    artifacts.save_artifacts(model, scaler, encoders, background_kmeans, metadata, fingerprint=fingerprint)

    report = dict(metadata)
    report["n_rows_used"] = len(cleaned)
    report["n_train"] = len(X_train)
    report["n_val"] = len(X_val)
    report["n_test"] = len(X_test)
    return report
