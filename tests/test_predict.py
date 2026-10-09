"""Tests for the single-patient path (src/predict.py). Needs models/ from fit_final."""
import numpy as np
import pandas as pd
import pytest

from src.calibration import apply_calibrator
from src.preprocess import encode, get_xy, load_config, load_data
from src.predict import PatientInputError, Predictor, colour_score

cfg = load_config()
df = load_data(cfg)
P = Predictor()
FULL = [P.input_from_row(df.iloc[i]) for i in range(len(df))]


def test_single_patient_encoding_matches_training_matrix_for_ALL_patients():
    """The form -> model path must reproduce the training matrix exactly, row by row."""
    train = encode(df, cfg)[P.features]
    got = pd.concat([P.encode_inputs(f)[0] for f in FULL], ignore_index=True)
    assert np.allclose(got.values, train.values, atol=1e-9)


@pytest.mark.parametrize("bbb", ["N", "LBBB", "RBBB"])
def test_bbb_variants_give_55_columns(bbb):
    X = P.encode_inputs({**FULL[0], "BBB": bbb})[0]
    assert X.shape == (1, 55)
    assert X.loc[0, "BBB_LBBB"] == (bbb == "LBBB") and X.loc[0, "BBB_RBBB"] == (bbb == "RBBB")


@pytest.mark.parametrize("i", [0, 60, 120, 180, 240, 300])
def test_prediction_matches_saved_models_and_shap_adds_up(i):
    res = P.predict(FULL[i], top_k=55)
    X = P.encode_inputs(FULL[i])[0]
    for t, b in P.bundles.items():
        raw = b["pipeline"].predict_proba(X)[:, 1]
        want = float(apply_calibrator(b["calibrator"], raw)[0])
        assert abs(res["targets"][t]["probability"] - want) < 1e-4
        assert 0 <= res["targets"][t]["probability"] <= 1
        # SHAP additivity: base value + sum of contributions = the model's own output
        ex = P.explainers[t]
        base = float(np.ravel(ex.expected_value)[-1])
        total = base + sum(c["shap"] for c in res["targets"][t]["contributions"])
        clf = b["pipeline"].named_steps["clf"]
        model_out = raw[0] if b["model_name"] == "rf" else float(b["pipeline"].decision_function(X)[0])
        assert abs(total - model_out) < 1e-3


def test_primary_fields_required_by_default():
    with pytest.raises(PatientInputError) as e:
        P.predict({})
    assert any("Age: required" in m for m in e.value.errors)


def test_defaults_path_works_and_warns_when_allowed():
    res = P.predict({}, require_primary=False)
    assert len(res["defaults_used"]) == 52
    assert any("Key fields" in w for w in res["warnings"])


def test_validation_reports_every_problem():
    bad = {**FULL[0], "Age": 300, "Sex": "robot", "Nope": 1, "DM": "maybe"}
    with pytest.raises(PatientInputError) as e:
        P.predict(bad)
    msg = " | ".join(e.value.errors)
    for needle in ["Age", "Sex", "Nope", "DM"]:
        assert needle in msg


def test_outside_training_range_warns_but_predicts():
    res = P.predict({**FULL[0], "TG": 5000})
    assert any("outside the training range" in w for w in res["warnings"])


def test_bmi_is_derived_not_asked():
    names = [f["name"] for f in P.form_spec()]
    assert "BMI" not in names and "Obesity" not in names and len(names) == 52


def test_primary_fields_cover_the_top_shap_features():
    imp = pd.read_csv("reports/shap_importance.csv", index_col=0)
    primary = {f["name"] for f in P.form_spec() if f["primary"]}
    for t in imp.columns:
        for feat in imp[t].sort_values(ascending=False).head(5).index:
            assert ("Sex" if feat == "Male" else feat) in primary, (t, feat)


def test_colour_score_is_amber_exactly_at_the_cutoff():
    assert colour_score(0, 0.4) == 0 and colour_score(1, 0.4) == 1
    assert abs(colour_score(0.4, 0.4) - 0.5) < 1e-12
