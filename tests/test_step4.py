"""Sanity checks on the saved models. Run after: evaluate -> fit_final."""
import joblib
import numpy as np
import pytest

from src.calibration import apply_calibrator
from src.preprocess import ROOT, get_xy, load_config, load_data

cfg = load_config()
df = load_data(cfg)
LEAK = {"LAD", "LCX", "RCA", "Cath"}


@pytest.mark.parametrize("target", ["CAD", "LAD", "LCX", "RCA"])
def test_saved_bundle(target):
    b = joblib.load(ROOT / f"models/{target}.joblib")
    assert not LEAK & set(b["features"])
    assert len(b["features"]) == 55
    assert 0 < b["threshold"] < 1
    X, y = get_xy(df, target, cfg)
    p = apply_calibrator(b["calibrator"], b["pipeline"].predict_proba(X[b["features"]])[:, 1])
    assert p.min() >= 0 and p.max() <= 1
    assert abs(p.mean() - y.mean()) < 0.05      # calibrated on average
