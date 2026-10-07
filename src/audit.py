"""Step 1: data audit. Run:  python -m src.audit
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
