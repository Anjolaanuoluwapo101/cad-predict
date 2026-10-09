"""Step 3: repeated stratified CV for all targets and models.

  python -m src.train_cv                 # full run
  python -m src.train_cv --quick         # 2x2 CV, fast smoke test
  python -m src.train_cv --shuffle       # label-shuffle leakage check

Writes reports/cv_folds.csv, cv_summary.csv, oof_probs.csv
(with --shuffle the files get a _shuffled suffix).
"""
import argparse
import time

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.metrics import (accuracy_score, brier_score_loss, f1_score,
                             precision_score, recall_score, roc_auc_score)
from sklearn.model_selection import RepeatedStratifiedKFold
from sklearn.pipeline import Pipeline

from src.models import make_models
from src.preprocess import ROOT, build_prep, get_xy, load_config, load_data

ap = argparse.ArgumentParser()
ap.add_argument("--quick", action="store_true")
ap.add_argument("--shuffle", action="store_true")
args = ap.parse_args()

cfg = load_config()
SEED = cfg["seed"]
df = load_data(cfg)
n_splits, n_repeats = (2, 2) if args.quick else (cfg["cv"]["n_splits"], cfg["cv"]["n_repeats"])
cv = RepeatedStratifiedKFold(n_splits=n_splits, n_repeats=n_repeats, random_state=SEED)

models = make_models(SEED, quick=args.quick)

rows, oof = [], []
t0 = time.time()
for target in cfg["targets"]:
    X, y = get_xy(df, target, cfg)
    if args.shuffle:
        y = pd.Series(np.random.default_rng(SEED).permutation(y.values), index=y.index)
    prep = build_prep(cfg, X.columns)
    for mname, est in models.items():
        for i, (tr, te) in enumerate(cv.split(X, y)):
            pipe = Pipeline([("prep", clone(prep)), ("clf", clone(est))])
            pipe.fit(X.iloc[tr], y.iloc[tr])
            p = pipe.predict_proba(X.iloc[te])[:, 1]
            pred = (p >= 0.5).astype(int)
            yt = y.iloc[te]
            rows.append(dict(
                target=target, model=mname, repeat=i // n_splits, fold=i % n_splits,
                acc=accuracy_score(yt, pred),
                prec=precision_score(yt, pred, zero_division=0),
                rec=recall_score(yt, pred),
                f1=f1_score(yt, pred),
                auc=roc_auc_score(yt, p),
                brier=brier_score_loss(yt, p)))
            oof.append(pd.DataFrame(dict(target=target, model=mname, repeat=i // n_splits,
                                         idx=X.index[te], y=yt.values, p=p)))
        print(f"{target:4s} {mname:9s} done  ({time.time() - t0:5.0f}s)", flush=True)

suffix = "_shuffled" if args.shuffle else ""
res = pd.DataFrame(rows)
res.to_csv(ROOT / f"reports/cv_folds{suffix}.csv", index=False)
pd.concat(oof).to_csv(ROOT / f"reports/oof_probs{suffix}.csv", index=False)
summary = res.groupby(["target", "model"])[["acc", "prec", "rec", "f1", "auc", "brier"]].agg(["mean", "std"])
summary.to_csv(ROOT / f"reports/cv_summary{suffix}.csv")
pd.set_option("display.width", 200)
print("\n", summary.xs("mean", axis=1, level=1).round(3).to_string())
