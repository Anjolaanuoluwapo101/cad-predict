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
