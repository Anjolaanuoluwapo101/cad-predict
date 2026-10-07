# CAD Risk Project: Steps 1–3, fully local

Everything here was run end to end on your dataset (Python 3.12, scikit-learn 1.8, pandas 3.0) and the numbers quoted are what I got. Your numbers should be very close; small differences between library versions are normal.

## 0. What you are building

```
cad-risk/
  config.yaml                 all settings (targets, columns, CV, seed)
  requirements.txt
  data/raw/<excel file>       never edit this
  src/preprocess.py           loading + encoding + the stateful prep step
  src/audit.py                Step 1 (also works as a notebook in VS Code)
  src/train_cv.py             Step 3
  tests/test_leakage.py       Step 2 safety net
  reports/                    tables and figures land here
  models/                     saved models later (Step 4)
```

Why plain `.py` files and not only notebooks: the brief scores reproducibility and code quality. Anyone should be able to clone the repo, run `pip install -r requirements.txt`, and rebuild every number.

## 1. Local setup (about 15 minutes)

1. Install **Python 3.10 or newer** (check: `python --version`) and **VS Code** with the *Python* and *Jupyter* extensions.
2. Create the folder and environment:

```bash
mkdir cad-risk && cd cad-risk
python -m venv .venv
# macOS/Linux:
source .venv/bin/activate
# Windows PowerShell:
.venv\Scripts\Activate.ps1
```
   (If PowerShell blocks the script: `Set-ExecutionPolicy -Scope Process RemoteSigned`, then retry.)

3. Make the folders and put the Excel file in `data/raw/`:

```bash
mkdir -p data/raw notebooks src tests reports models
touch src/__init__.py tests/__init__.py
```
4. Create `requirements.txt` and install:

```text
pandas>=2.2
numpy>=1.26
scikit-learn>=1.4
openpyxl>=3.1
matplotlib>=3.8
pyyaml>=6.0
joblib>=1.3
pytest>=8.0
```

```bash
pip install -r requirements.txt
git init   # commit after every step
```
5. In VS Code press Ctrl+Shift+P → *Python: Select Interpreter* → choose `.venv`.

**Always run commands from the project root** (the `cad-risk/` folder) using `python -m src.something`. That is what makes `from src.preprocess import ...` work.

## 2. `config.yaml`

Everything later reads this file, so adding a target or feature never needs a redesign. The Excel filename keeps the dataset's original spelling ("extention"); match your file exactly.

```yaml
seed: 42
data_path: data/raw/extention_of_Z-Alizadeh_sani_dataset.xlsx
sheet: "Sheet 1 - Table 1"        # the other sheet is empty

# target name -> (answer column, value that means "positive")
targets:
  CAD: {column: Cath, positive: CAD}
  LAD: {column: LAD,  positive: Stenotic}
  LCX: {column: LCX,  positive: Stenotic}
  RCA: {column: RCA,  positive: Stenotic}

leakage_columns: [LAD, LCX, RCA, Cath]   # never allowed in X
drop_columns: ["Exertional CP"]          # constant column (all "N")

continuous: [Age, Weight, Length, BMI, BP, PR, FBS, CR, TG, LDL, HDL, BUN,
             ESR, HB, K, Na, WBC, Lymph, Neut, PLT, EF-TTE]

cv: {n_splits: 5, n_repeats: 5}
```

## 3. `src/preprocess.py`

The key idea is two kinds of preprocessing:

- **Stateless** (`encode`, `get_xy`): fixed rules that learn nothing from the data (Y→1, Male→1, the VHD order). Safe to apply to all 303 rows first.
- **Stateful** (`build_prep`): imputing and scaling learn from data, so they run **inside** the cross-validation pipeline and are fitted only on each round's training patients. This prevents preprocessing leakage.

```python
"""Data loading, encoding and preprocessing for the CAD risk project.

Two kinds of preprocessing:
  * STATELESS (encode, get_xy): fixed rules that learn nothing from the data.
    Safe to apply to the whole dataset before cross-validation.
  * STATEFUL (build_prep): imputing and scaling learn from data, so they live
    inside the sklearn Pipeline and are re-fitted on each fold's training rows.
"""
from pathlib import Path

import pandas as pd
import yaml
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
VESSELS = ["LAD", "LCX", "RCA"]


def load_config(path=None):
    path = Path(path) if path else ROOT / "config.yaml"
    with open(path) as f:
        return yaml.safe_load(f)


def load_data(cfg):
    return pd.read_excel(ROOT / cfg["data_path"], sheet_name=cfg["sheet"])


def encode(df, cfg):
    """Stateless encoding. Returns the numeric feature table (no targets)."""
    X = df.drop(columns=cfg["leakage_columns"] + cfg["drop_columns"],
                errors="ignore").copy()

    # Y/N columns -> 1/0
    for c in X.columns:
        if not pd.api.types.is_numeric_dtype(X[c]) and set(X[c].unique()) <= {"Y", "N"}:
            X[c] = (X[c] == "Y").astype(int)

    # Sex: "Male" / "Fmale" (typo in the source). Anything not Male -> 0.
    X["Male"] = (X.pop("Sex") == "Male").astype(int)

    # VHD is ordinal. Lowercase first: the file has "mild" and "Moderate".
    X["VHD"] = X["VHD"].str.lower().map({"n": 0, "mild": 1, "moderate": 2, "severe": 3})
    assert X["VHD"].notna().all(), "unmapped VHD spelling"

    # BBB has no natural order -> indicator flags, "N" is the reference level.
    X = pd.get_dummies(X, columns=["BBB"], dtype=int).drop(columns="BBB_N")

    bad = X.select_dtypes(exclude="number").columns.tolist()
    assert not bad, f"non-numeric columns left after encoding: {bad}"
    return X


def consistent_mask(df):
    """True where the Cath label agrees with the three vessel labels.

    Dataset rule: CAD <=> at least one of LAD/LCX/RCA is stenotic.
    Excel row 95 violates it.
    """
    any_vessel = (df[VESSELS] == "Stenotic").any(axis=1)
    return any_vessel == (df["Cath"] == "CAD")


def get_xy(df, name, cfg):
    """Features X and 0/1 target y for one of CAD / LAD / LCX / RCA."""
    t = cfg["targets"][name]
    y = (df[t["column"]] == t["positive"]).astype(int)
    X = encode(df, cfg)
    if name == "CAD":                       # drop the contradictory row, CAD only
        keep = consistent_mask(df)
        X, y = X[keep], y[keep]
    return X, y


def build_prep(cfg, columns):
    """Stateful part: impute + scale. Unfitted; goes inside the CV Pipeline."""
    cont = [c for c in cfg["continuous"] if c in columns]
    return ColumnTransformer(
        [("num", Pipeline([("imp", SimpleImputer(strategy="median")),
                           ("sc", StandardScaler())]), cont)],
        remainder=SimpleImputer(strategy="most_frequent"),
        verbose_feature_names_out=False,
    ).set_output(transform="pandas")
```

Decisions worth defending in your documentation:

| Decision | Reason |
|---|---|
| `LAD, LCX, RCA, Cath` removed from X | Required by the brief (target leakage) |
| `Exertional CP` dropped | Constant (all "N"), carries no information |
| `VHD` as 0–3 | It is ordinal. Lowercased first because the file has both `mild` and `Moderate` |
| `BBB` as LBBB/RBBB flags | No natural order; "N" is the reference level |
| Row 95 dropped, CAD model only | Its `Cath` label contradicts its vessel labels. The vessel models keep it because their own labels are fine |
| Median imputer + scaler | The data has no gaps, but the future web form might leave a field empty |
| `Fmale` left as is | Typo is harmless: everything that is not "Male" becomes 0 |

**A bug I hit that you may also hit:** pandas 3 stores text as a `str` type, not `object`. A check written as `dtype == object` silently skips every Y/N column. The code above uses `is_numeric_dtype` instead, and the "all numeric after encoding" assertion exists to catch exactly this class of mistake.

## 4. Step 1: data audit (`src/audit.py`)

Goal: prove you understand the data before modelling. Each section becomes a table or figure in your documentation.

```python
"""Step 1: data audit. Run:  python -m src.audit
Open in VS Code and the '# %%' markers become notebook cells.
Writes reports/data_audit.md and reports/class_balance.png
"""
# %% imports
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
from src.preprocess import ROOT, VESSELS, consistent_mask, encode, load_config, load_data

cfg = load_config()
df = load_data(cfg)
out = []
def log(title, body=""):
    print(f"\n== {title}\n{body}")
    out.append(f"## {title}\n\n```\n{body}\n```\n")

# %% 1.1 basic facts
log("1.1 Shape, missing, duplicates",
    f"shape={df.shape}\nmissing cells={df.isna().sum().sum()}\nduplicate rows={df.duplicated().sum()}")

# %% 1.2 inventory of text columns (encodings = main source of silent bugs)
txt = {c: df[c].value_counts().to_dict() for c in df.select_dtypes(exclude="number").columns}
log("1.2 Text columns", "\n".join(f"{c}: {v}" for c, v in txt.items()))

# %% 1.3 class balance
bal = {}
for name, t in cfg["targets"].items():
    pos = int((df[t["column"]] == t["positive"]).sum())
    bal[name] = (pos, len(df) - pos)
log("1.3 Class balance (positive, negative)", "\n".join(f"{k}: {v}" for k, v in bal.items()))
fig, ax = plt.subplots(figsize=(6, 3.5))
ax.bar(bal.keys(), [v[0] for v in bal.values()], label="positive")
ax.bar(bal.keys(), [v[1] for v in bal.values()], bottom=[v[0] for v in bal.values()], label="negative")
ax.set_ylabel("patients"); ax.set_title("Class balance per target"); ax.legend()
fig.tight_layout(); fig.savefig(ROOT / "reports/class_balance.png", dpi=150)

# %% 1.4 label consistency
bad = df.index[~consistent_mask(df)]
log("1.4 Rows where Cath disagrees with vessel labels (Excel row numbers)",
    str([int(i) + 2 for i in bad]) + "\n(+2: pandas starts at 0, Excel header is row 1)")

# %% 1.5 constant / rare columns (after encoding)
X = encode(df, {**cfg, "drop_columns": []})   # keep Exertional CP to show it is constant
const = X.nunique()[X.nunique() == 1].index.tolist()
binary = X.columns[X.nunique() == 2]
rare = X[binary].sum().sort_values().head(10)
log("1.5 Constant columns after encoding + rarest binary columns (count of 1s)",
    f"constant: {const}\nfeatures before dropping constants: {X.shape[1]}\n{rare.to_string()}")

# %% 1.6 redundancy
bmi_err = (df["BMI"] - df["Weight"] / (df["Length"] / 100) ** 2).abs().max()
ob = pd.crosstab(df["Obesity"], df["BMI"] >= 25)
corr = df[["Lymph", "Neut"]].corr().iloc[0, 1]
log("1.6 Redundancy",
    f"max |BMI - Weight/Height^2| = {bmi_err:.3f}\nObesity vs BMI>=25:\n{ob.to_string()}\ncorr(Lymph, Neut) = {corr:.2f}")

# %% 1.7 range sanity
log("1.7 describe()", df.describe().T[["min", "mean", "max"]].round(2).to_string())

# %% write report
(ROOT / "reports/data_audit.md").write_text("# Data audit\n\n" + "\n".join(out))
print("\nwrote reports/data_audit.md and reports/class_balance.png")
```

Run it:

```bash
python -m src.audit
```

**To use it as a notebook:** open `src/audit.py` in VS Code. Each `# %%` line shows a *Run Cell* button and opens an interactive Jupyter window. For the submission you can also right-click → *Export as Jupyter Notebook* into `notebooks/01_data_audit.ipynb`.

**What you should see** (these are the facts to put in your "data quirks" table):

| Check | Expected |
|---|---|
| Shape / missing / duplicates | (303, 59) / 0 / 0 |
| Positives | CAD 216 (87 normal), LAD 177, LCX 119, RCA 114 |
| Contradictory label | Excel row **95** only |
| Constant column | `Exertional CP` |
| Features after encoding | **55** (59 − 4 answers − Exertional CP − Sex + Male + 2 BBB flags) |
| Rarest binary columns | CHF = 1 patient, LowTH Ang = 2, Weak Peripheral Pulse = 5 |
| `BMI` | Exactly Weight / Height², so it is redundant |
| `Obesity` vs BMI ≥ 25 | 210 of 211 "Y" are ≥ 25, and no "N" is. One exception |
| Lymph vs Neut correlation | **−0.92** (strongly negative: they are percentages that sum to roughly 100) |
| Outliers to note | TG up to 1050, FBS up to 400, WBC up to 18000, PLT as low as 25: plausible but extreme. Mention, don't delete |

Two corrections to the earlier chat: the feature count is 55, not 54, and the Lymph/Neut correlation is negative.

Very rare columns like CHF (1 positive) cannot teach a model anything, and in cross-validation some folds will have zero positives for them. That is fine; just state it.

## 5. Step 2: the leakage test (`tests/test_leakage.py`)

```python
import pytest
from src.preprocess import encode, get_xy, load_config, load_data

cfg = load_config()
df = load_data(cfg)
LEAK = {"LAD", "LCX", "RCA", "Cath"}


@pytest.mark.parametrize("target", ["CAD", "LAD", "LCX", "RCA"])
def test_no_leakage_columns(target):
    X, y = get_xy(df, target, cfg)
    assert not LEAK & set(X.columns)
    assert "Exertional CP" not in X.columns
    assert set(y.unique()) == {0, 1}
    assert len(X) == len(y)


def test_all_numeric_no_nan():
    X = encode(df, cfg)
    assert not X.select_dtypes(exclude="number").shape[1]
    assert X.isna().sum().sum() == 0


def test_feature_count():
    # 59 columns - 4 answers - Exertional CP - Sex + Male + 2 BBB flags
    assert encode(df, cfg).shape[1] == 55


def test_cad_drops_contradictory_row_only():
    assert len(get_xy(df, "CAD", cfg)[0]) == len(df) - 1
    for v in ["LAD", "LCX", "RCA"]:
        assert len(get_xy(df, v, cfg)[0]) == len(df)


def test_class_counts():
    assert get_xy(df, "LAD", cfg)[1].sum() == 177
    assert get_xy(df, "LCX", cfg)[1].sum() == 119
    assert get_xy(df, "RCA", cfg)[1].sum() == 114
```

```bash
python -m pytest -q
```

Expect `8 passed`. This file is direct evidence for "leakage prevention" and "code quality" in the rubric. If you later change the encoding, update `test_feature_count` deliberately, since a failing count is a useful alarm.

## 6. Step 3: repeated cross-validation (`src/train_cv.py`)

```python
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
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, brier_score_loss, f1_score,
                             precision_score, recall_score, roc_auc_score)
from sklearn.model_selection import RepeatedStratifiedKFold
from sklearn.pipeline import Pipeline

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

models = {
    "logreg": LogisticRegression(class_weight="balanced", max_iter=5000),
    "rf": RandomForestClassifier(n_estimators=200 if args.quick else 500,
                                 class_weight="balanced", random_state=SEED, n_jobs=-1),
    "hgb": HistGradientBoostingClassifier(class_weight="balanced", random_state=SEED),
    "baseline": DummyClassifier(strategy="prior"),
}

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
```

Why it is written this way:

- **Manual loop**: it gives you out-of-fold probabilities for every patient, which Step 4 (calibration and cutoffs) needs. `cross_val_predict` does not support repeated CV.
- **A fresh Pipeline per fold**: scaling and imputing are fitted on training rows only.
- **Stratified**: each target keeps its own class ratio in every fold.
- **`class_weight="balanced"`**: your class-imbalance decision. `HistGradientBoostingClassifier` supports it from scikit-learn 1.2.
- **Dummy baseline**: the "lazy model". Its AUC must be exactly 0.5.
- **No tuning yet**: defaults on purpose. Tuning comes later and must use nested CV or you inflate the scores.

Run in this order:

```bash
python -m src.train_cv --quick      # 2x2 CV, a few seconds: checks nothing is broken
python -m src.train_cv              # full 5x5, about 1.5 minutes on one CPU core
python -m src.train_cv --shuffle    # leakage check, see below
```

### Expected results (mean over 25 folds)

| Target | Model | Acc | Prec | Rec | F1 | AUC | AUC sd | Brier |
|---|---|---|---|---|---|---|---|---|
| CAD | baseline | 0.715 | 0.715 | 1.00 | 0.834 | 0.500 | 0 | 0.204 |
| CAD | hgb | 0.875 | 0.913 | 0.914 | 0.913 | 0.922 | 0.038 | 0.097 |
| CAD | logreg | 0.861 | 0.931 | 0.870 | 0.899 | 0.929 | 0.030 | 0.104 |
| CAD | rf | 0.867 | 0.871 | 0.956 | 0.911 | **0.936** | 0.029 | 0.109 |
| LAD | baseline | 0.584 | 0.584 | 1.00 | 0.737 | 0.500 | 0 | 0.243 |
| LAD | hgb | 0.742 | 0.781 | 0.783 | 0.779 | 0.814 | 0.057 | 0.188 |
| LAD | logreg | 0.727 | 0.794 | 0.726 | 0.756 | 0.826 | 0.054 | 0.182 |
| LAD | rf | 0.787 | 0.778 | 0.894 | 0.831 | **0.851** | 0.045 | 0.164 |
| LCX | baseline | 0.607 | 0 | 0 | 0 | 0.500 | 0 | 0.239 |
| LCX | hgb | 0.684 | 0.606 | 0.564 | 0.581 | 0.725 | 0.055 | 0.226 |
| LCX | logreg | 0.638 | 0.538 | 0.608 | 0.568 | 0.687 | 0.077 | 0.238 |
| LCX | rf | 0.667 | 0.640 | 0.366 | 0.460 | **0.728** | 0.059 | 0.207 |
| RCA | baseline | 0.624 | 0 | 0 | 0 | 0.500 | 0 | 0.235 |
| RCA | hgb | 0.672 | 0.570 | 0.541 | 0.547 | 0.696 | 0.056 | 0.239 |
| RCA | logreg | 0.669 | 0.554 | 0.647 | 0.593 | **0.722** | 0.057 | 0.222 |
| RCA | rf | 0.669 | 0.618 | 0.307 | 0.401 | 0.712 | 0.052 | 0.207 |

### How to read this honestly

1. **CAD is strong (AUC about 0.93); LAD is good (about 0.85); LCX and RCA are weak (about 0.70–0.73).** Predicting *which* vessel is blocked from clinical features alone is genuinely harder. Report this plainly: it is what the data supports, and evaluators reward honesty over inflated numbers.
2. **The AUC standard deviation is 0.03–0.08.** The three real models are within one standard deviation of each other on every target. Treat those differences as ties. Do not claim "RF beats logistic regression".
3. **Accuracy is misleading for CAD.** The baseline gets 0.715 accuracy by always saying "CAD". Judge by AUC, Brier and recall.
4. **RF recall on LCX/RCA is only 0.31–0.37 at the default 0.5 cutoff.** The model ranks patients decently (AUC 0.71–0.73) but its probabilities sit mostly below 0.5. This is exactly what Step 4 (choosing cutoffs from the out-of-fold probabilities) fixes. It is also why the 3D colours should use calibrated probabilities, not hard yes/no labels.
5. **Baseline AUC is exactly 0.5**, so the metric code is correct.

### The label-shuffle test

`--shuffle` randomly permutes the target and reruns everything. In my run every real model fell to AUC 0.41–0.58 (about 0.5, as expected), and the real-label run was far higher. That is your proof that the real scores are not coming from leakage. If any model stayed high on shuffled labels, an answer column has leaked into X.

Put one line in your documentation: *"Label-shuffled control: AUC ≈ 0.5 for all models and targets."*

## 7. Checkpoint: what you should now have

| File | Used as evidence for |
|---|---|
| `reports/data_audit.md`, `class_balance.png` | Dataset preprocessing section |
| `tests/test_leakage.py` passing | Leakage prevention, code quality |
| `reports/cv_folds.csv`, `cv_summary.csv` | Validation methodology, predictive performance (30% of the score) |
| `reports/oof_probs.csv` | Input to Step 4: calibration and cutoffs |
| `reports/*_shuffled.csv` | Leakage control |
| `config.yaml`, `requirements.txt`, fixed seed | Reproducibility |

Commit now: `git add . && git commit -m "Steps 1-3: audit, preprocessing, repeated CV"`.

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `ModuleNotFoundError: src` | Run from the project root with `python -m src.train_cv`, not `python src/train_cv.py` |
| `FileNotFoundError` on the Excel file | The name in `config.yaml` must match exactly, including "extention" |
| `ValueError: Worksheet named ... not found` | Sheet name in `config.yaml` must be `Sheet 1 - Table 1` |
| Y/N columns not converted (assertion about non-numeric columns) | You are on pandas 3; use the `is_numeric_dtype` check shown above |
| `class_weight` error for `HistGradientBoostingClassifier` | scikit-learn older than 1.2: upgrade it |
| Very slow run | Lower `n_estimators` for `rf`, or use `--quick` while developing |

## 9. Next

Step 4 uses `reports/oof_probs.csv` to (a) check calibration curves, (b) pick one model per target, (c) choose decision thresholds, and then (d) fit final models on all data, save them to `models/`, and compute SHAP values. After that come the FastAPI backend, the 3D viewer using your `heart_groningen_split.glb` (it has separate `LAD`, `LCX`, `RCA` nodes) and the documentation.
