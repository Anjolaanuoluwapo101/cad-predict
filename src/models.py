"""The model zoo, defined once so training (train_cv.py) and the final fit
(fit_final.py) can never drift apart."""
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression


def make_models(seed, quick=False):
    return {
        "logreg": LogisticRegression(class_weight="balanced", max_iter=5000),
        "rf": RandomForestClassifier(n_estimators=200 if quick else 500,
                                     class_weight="balanced", random_state=seed, n_jobs=-1),
        "hgb": HistGradientBoostingClassifier(class_weight="balanced", random_state=seed),
        "baseline": DummyClassifier(strategy="prior"),
    }
