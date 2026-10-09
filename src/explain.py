"""Step 4c: SHAP explanations from the saved models.

  python -m src.explain

Writes reports/shap_<TARGET>.csv (one row per patient, one column per feature),
reports/shap_importance.csv and reports/shap_importance.png.

Units: random-forest SHAP values are in probability units; logistic-regression
SHAP values are in log-odds. Compare features WITHIN a target, not across targets.
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import joblib
import numpy as np
import pandas as pd
import shap
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression

from src.preprocess import ROOT, get_xy, load_config, load_data


def make_explainer(bundle, background):
    """Build the right SHAP explainer for the saved model. `background` = transformed training X."""
    clf = bundle["pipeline"].named_steps["clf"]
    if isinstance(clf, RandomForestClassifier):
        return shap.TreeExplainer(clf)
    if isinstance(clf, LogisticRegression):
        # use ALL background rows (shap would otherwise subsample 100 of 303)
        return shap.LinearExplainer(clf, shap.maskers.Independent(background, max_samples=len(background)))
    raise ValueError(f"no SHAP explainer wired up for {type(clf).__name__}")


def explain_values(explainer, Xt):
    """SHAP matrix (patients x features) for the 'disease' class."""
    sv = explainer.shap_values(Xt)
    sv = np.asarray(sv[1] if isinstance(sv, list) else sv)
    return sv[:, :, 1] if sv.ndim == 3 else sv


def shap_values_for(bundle, X):
    """Return (transformed X, SHAP matrix for the 'disease' class)."""
    Xt = bundle["pipeline"].named_steps["prep"].transform(X)
    return Xt, explain_values(make_explainer(bundle, Xt), Xt)


if __name__ == "__main__":
    cfg = load_config()
    df = load_data(cfg)
    imp = {}
    for target in cfg["targets"]:
        bundle = joblib.load(ROOT / f"models/{target}.joblib")
        X, y = get_xy(df, target, cfg)
        Xt, sv = shap_values_for(bundle, X)
        pd.DataFrame(sv, columns=Xt.columns, index=X.index).to_csv(ROOT / f"reports/shap_{target}.csv")
        imp[target] = pd.Series(np.abs(sv).mean(0), index=Xt.columns).sort_values(ascending=False)
        print(f"\n{target} ({bundle['model_name']}): top 8 features by mean |SHAP|")
        print(imp[target].head(8).round(4).to_string())

    pd.DataFrame(imp).to_csv(ROOT / "reports/shap_importance.csv")
    fig, axes = plt.subplots(1, 4, figsize=(17, 4.5))
    for ax, (t, s) in zip(axes, imp.items()):
        s.head(10)[::-1].plot.barh(ax=ax)
        ax.set_title(t); ax.set_xlabel("mean |SHAP|")
    fig.tight_layout(); fig.savefig(ROOT / "reports/shap_importance.png", dpi=150)
    print("\nwrote shap_*.csv, shap_importance.csv, shap_importance.png")
