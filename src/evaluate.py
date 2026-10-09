"""Step 4a: choose a model per target, calibrate, pick cutoffs, report honest metrics.

  python -m src.evaluate

Reads  reports/cv_folds.csv and reports/oof_probs.csv   (from Step 3)
Writes reports/model_selection.csv, final_metrics.csv, final_config.json,
       calibration.png
"""
import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.model_selection import StratifiedKFold

from src.calibration import apply_calibrator, fit_calibrator, metrics, youden_threshold
from src.preprocess import ROOT, load_config

cfg = load_config()
SEED = cfg["seed"]
R = ROOT / "reports"
folds = pd.read_csv(R / "cv_folds.csv")
oof = pd.read_csv(R / "oof_probs.csv")

# ---- 1. model selection: best mean AUC among the real models ---------------
auc = (folds[folds.model != "baseline"].groupby(["target", "model"]).auc
       .agg(["mean", "std"]).round(4).reset_index())
best = auc.loc[auc.groupby("target")["mean"].idxmax()].set_index("target")
runner = (auc.sort_values("mean", ascending=False).groupby("target").nth(1)
          .set_index("target")["mean"])
sel = best.rename(columns={"mean": "auc_mean", "std": "auc_sd"})
sel["margin_over_runner_up"] = (sel["auc_mean"] - runner).round(4)
sel.to_csv(R / "model_selection.csv")
print("== Selected models (best mean CV AUC)\n", sel.to_string(), "\n")

# ---- 2. honest evaluation: calibrate + choose cutoff INSIDE inner folds ------
rows, plot_data, final = [], {}, {}
for target, mname in sel["model"].items():
    d = oof[(oof.target == target) & (oof.model == mname)]
    p_raw_all, p_cal_all, y_all = [], [], []
    per_repeat = []
    for r, g in d.groupby("repeat"):
        p, y = g.p.values, g.y.values
        p_cal, thr_used = np.zeros(len(p)), np.zeros(len(p))
        skf = StratifiedKFold(5, shuffle=True, random_state=SEED + int(r))
        for tr, te in skf.split(p, y):
            cal = fit_calibrator(p[tr], y[tr])                      # learn on inner-train
            thr = youden_threshold(y[tr], apply_calibrator(cal, p[tr]))
            p_cal[te] = apply_calibrator(cal, p[te])                # apply to inner-test
            thr_used[te] = thr
        m_raw = metrics(y, p, 0.5)
        m_cal = metrics(y, p_cal, thr_used)      # thr_used: one cutoff per patient, from the other folds
        per_repeat.append(("raw @0.5", m_raw)); per_repeat.append(("calibrated + tuned cutoff", m_cal))
        p_raw_all.append(p); p_cal_all.append(p_cal); y_all.append(y)
    pr = pd.DataFrame([{"target": target, "model": mname, "stage": s, **m} for s, m in per_repeat])
    rows.append(pr)
    plot_data[target] = (np.concatenate(y_all), np.concatenate(p_raw_all), np.concatenate(p_cal_all))

    # ---- 3. final calibrator + cutoff from ALL out-of-fold predictions -------
    cal = fit_calibrator(d.p.values, d.y.values)
    thr = youden_threshold(d.y.values, apply_calibrator(cal, d.p.values))
    final[target] = dict(model=mname, threshold=round(thr, 4),
                         calibration_slope=round(float(cal.coef_[0][0]), 3),
                         calibration_intercept=round(float(cal.intercept_[0]), 3))

res = pd.concat(rows)
tab = (res.groupby(["target", "model", "stage"])[["acc", "prec", "sens", "spec", "f1", "auc", "brier"]]
       .agg(["mean", "std"]))
tab.to_csv(R / "final_metrics.csv")
pd.set_option("display.width", 220)
print("== Honest metrics (mean over 5 repeats; calibrator and cutoff learned on inner folds only)")
print(tab.xs("mean", axis=1, level=1).round(3).to_string(), "\n")
(R / "final_config.json").write_text(json.dumps(final, indent=2))
print("== Final cutoffs and calibration (fitted on all out-of-fold predictions)")
print(json.dumps(final, indent=2))

# ---- 4. reliability diagrams -------------------------------------------------
fig, axes = plt.subplots(1, 4, figsize=(16, 4), sharex=True, sharey=True)
for ax, (target, (y, p_raw, p_cal)) in zip(axes, plot_data.items()):
    for p, lab, mk in [(p_raw, "raw", "o"), (p_cal, "calibrated", "s")]:
        fr, mp = calibration_curve(y, p, n_bins=6, strategy="quantile")
        ax.plot(mp, fr, marker=mk, label=lab)
    ax.plot([0, 1], [0, 1], "k--", lw=0.8)
    ax.set_title(f"{target} ({sel.loc[target, 'model']})")
    ax.set_xlabel("predicted probability")
axes[0].set_ylabel("observed fraction with disease"); axes[0].legend()
fig.tight_layout(); fig.savefig(R / "calibration.png", dpi=150)
print("\nwrote model_selection.csv, final_metrics.csv, final_config.json, calibration.png")
