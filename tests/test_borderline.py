"""Tests for the 34 required fields and the 'borderline' band (put in tests/)."""
import pytest

from src.predict import BORDERLINE_FACTOR, PatientInputError, Predictor
from src.preprocess import load_data


@pytest.fixture(scope="module")
def pred():
    return Predictor()          # slow (loads models), so built once for this file


@pytest.fixture(scope="module")
def patient(pred):
    df = load_data(pred.cfg)
    return pred.input_from_row(df.iloc[0])


def required(pred):
    return [n for n, s in pred.schema.items() if s["primary"]]


def test_required_field_counts(pred):
    assert len(pred.schema) == 52
    assert len(required(pred)) == 34


def test_extended_fields_are_required(pred):
    for name in ["HDL", "K", "VHD", "HB", "PR", "Current Smoker", "FH", "WBC", "DLP", "St Depression"]:
        assert pred.schema[name]["primary"], name


def test_empty_form_is_rejected_with_every_missing_field(pred):
    with pytest.raises(PatientInputError) as e:
        pred.predict({})
    assert len(e.value.errors) == 34


def test_full_form_has_no_band(pred, patient):
    r = pred.predict(patient)
    assert r["defaults_used"] == []
    for t in r["targets"].values():
        assert t["borderline_from"] == pytest.approx(t["threshold"], abs=1e-4)
        assert t["status"] in ("positive", "negative")
        assert (t["status"] == "positive") == t["predicted_positive"]


def test_required_only_form_uses_band(pred, patient):
    req = set(required(pred))
    r = pred.predict({k: v for k, v in patient.items() if k in req})
    assert len(r["defaults_used"]) == 18
    assert any("optional fields were not provided" in w for w in r["warnings"])
    for name, t in r["targets"].items():
        expect = t["threshold"] * BORDERLINE_FACTOR[name]
        assert t["borderline_from"] == pytest.approx(expect, abs=1e-3)
        if t["status"] == "borderline":
            assert not t["predicted_positive"]
            assert t["probability"] >= t["borderline_from"] - 1e-4
        if t["status"] == "negative":
            assert t["probability"] < t["borderline_from"] + 1e-4


def test_one_blank_optional_field_still_triggers_band(pred, patient):
    optional = [n for n in pred.schema if n not in required(pred)]
    r = pred.predict({k: v for k, v in patient.items() if k != optional[0]})
    assert r["defaults_used"] == [optional[0]]
    for name, t in r["targets"].items():
        assert t["borderline_from"] == pytest.approx(t["threshold"] * BORDERLINE_FACTOR[name], abs=1e-3)
