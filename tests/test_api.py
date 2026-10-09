"""API tests (put in tests/). `with TestClient(app)` runs startup, so the models load once."""
import pytest
from fastapi.testclient import TestClient

from api.main import app
from src.preprocess import load_data


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def patient(client):
    pred = client.app.state.predictor
    return pred.input_from_row(load_data(pred.cfg).iloc[0])


@pytest.fixture(scope="module")
def required(client):
    return set(client.get("/features").json()["required"])


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert set(body["targets"]) == {"CAD", "LAD", "LCX", "RCA"}


def test_features(client):
    r = client.get("/features")
    assert r.status_code == 200
    body = r.json()
    assert body["n_fields"] == 52 == len(body["fields"])
    assert body["n_required"] == 34 == len(body["required"])
    assert "Laboratory" in body["groups"]


def test_predict_full_form(client, patient):
    r = client.post("/predict", json=patient)
    assert r.status_code == 200
    body = r.json()
    assert set(body["targets"]) == {"CAD", "LAD", "LCX", "RCA"}
    assert body["defaults_used"] == []
    assert body["disclaimer"]
    for t in body["targets"].values():
        assert 0 <= t["probability"] <= 1
        assert t["status"] in ("positive", "negative")
        assert len(t["contributions"]) == 8


def test_predict_required_only_gets_band(client, patient, required):
    r = client.post("/predict", json={k: v for k, v in patient.items() if k in required})
    assert r.status_code == 200
    body = r.json()
    assert len(body["defaults_used"]) == 18
    for t in body["targets"].values():
        assert t["status"] in ("positive", "borderline", "negative")
        assert t["borderline_from"] < t["threshold"]


def test_empty_form_lists_every_missing_field(client):
    r = client.post("/predict", json={})
    assert r.status_code == 422
    assert len(r.json()["errors"]) == 34


def test_unknown_field_is_named(client, patient):
    r = client.post("/predict", json={**patient, "Shoe size": 42})
    assert r.status_code == 422
    assert any("Shoe size" in e for e in r.json()["errors"])


def test_bad_value_is_rejected(client, patient):
    r = client.post("/predict", json={**patient, "Age": 400})
    assert r.status_code == 422
    assert any("Age" in e for e in r.json()["errors"])


def test_non_object_body_is_rejected(client):
    assert client.post("/predict", json=[1, 2, 3]).status_code == 422


def test_top_k_is_validated(client, patient):
    assert client.post("/predict?top_k=0", json=patient).status_code == 422
    r = client.post("/predict?top_k=3", json=patient)
    assert len(r.json()["targets"]["CAD"]["contributions"]) == 3


def test_cors_allows_only_the_frontend(client):
    ok = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    bad = client.get("/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in bad.headers
