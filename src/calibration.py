"""Small helpers for Step 4: calibration, cutoffs, metrics.

Only plain scikit-learn objects are stored on disk (no custom classes), so
saved models load in the backend without importing this file.
"""
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, brier_score_loss, f1_score,
                             precision_score, recall_score, roc_auc_score, roc_curve)

EPS = 1e-4


def _logit(p):
    p = np.clip(np.asarray(p, dtype=float), EPS, 1 - EPS)
    return np.log(p / (1 - p)).reshape(-1, 1)


def fit_calibrator(p, y):
    """Platt scaling: a 1-feature logistic regression on logit(p)."""
    return LogisticRegression(C=1e6, max_iter=1000).fit(_logit(p), y)


def apply_calibrator(cal, p):
    return cal.predict_proba(_logit(p))[:, 1]


def youden_threshold(y, p):
    """Cutoff that maximises sensitivity + specificity - 1."""
    fpr, tpr, thr = roc_curve(y, p)
    return float(thr[np.argmax(tpr - fpr)])


def metrics(y, p, thr):
    y = np.asarray(y)
    pred = (np.asarray(p) >= thr).astype(int)
    tn = ((pred == 0) & (y == 0)).sum()
    fp = ((pred == 1) & (y == 0)).sum()
    return dict(
        acc=accuracy_score(y, pred),
        prec=precision_score(y, pred, zero_division=0),
        sens=recall_score(y, pred),
        spec=tn / (tn + fp) if (tn + fp) else 0.0,
        f1=f1_score(y, pred),
        auc=roc_auc_score(y, p),
        brier=brier_score_loss(y, p),
    )
