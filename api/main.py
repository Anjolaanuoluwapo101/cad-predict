"""Step 5b: the web API in front of src.predict.Predictor.

Run from the cad-risk/ folder (so `import src...` works):
    uvicorn api.main:app --reload
then open http://127.0.0.1:8000/docs to try every endpoint.

    GET  /health    is the server up, and which models are loaded
    GET  /features  the form definition: fields, labels, units, defaults, which are required
    POST /predict   one patient's form values in -> risks, flags, SHAP reasons out

This file only wires HTTP to Predictor. It contains no model logic.
"""
import logging
import os
import threading
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Body, FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.predict import DISCLAIMER, PatientInputError, Predictor

log = logging.getLogger("cad-risk-api")

# Web pages allowed to call this API (Vite's default dev address). Override with
# CAD_ALLOWED_ORIGINS="https://my-site.com,http://localhost:5173" when deploying.
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get(
    "CAD_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:8000,http://127.0.0.1:5173").split(",") if o.strip()]

# Predictor loads four models and four SHAP explainers (slow), so it is built once at
# startup and shared. The lock makes overlapping requests take turns.

_predict_lock = threading.Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Loading models...")
    app.state.predictor = Predictor()
    log.info("Models loaded.")
    yield


app = FastAPI(
    title="CAD risk API",
    description="Decision support and educational use only. " + DISCLAIMER,
    version="1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def _predictor(request: Request) -> Predictor:
    return request.app.state.predictor


@app.get("/health")
def health(request: Request):
    pred = _predictor(request)
    return {"status": "ok", "targets": list(pred.bundles), "disclaimer": DISCLAIMER}


@app.get("/features")
def features(request: Request):
    """Everything the web form needs. `primary: true` means the field is required."""
    fields = _predictor(request).form_spec()
    required = [f["name"] for f in fields if f.get("primary")]
    groups = list(dict.fromkeys(f["group"] for f in fields))      # keeps the form's order
    return {"n_fields": len(fields), "n_required": len(required), "required": required,
            "groups": groups, "fields": fields}


@app.post("/predict")
def predict(request: Request,
            patient: dict[str, Any] = Body(..., description="form field name -> value"),
            top_k: int = Query(8, ge=1, le=20, description="how many SHAP reasons per target")):
    """Missing required fields, unknown fields and bad values come back together as
    422 {"errors": [...]}, so the form can highlight every problem at once."""
    pred = _predictor(request)
    try:
        with _predict_lock:
            return pred.predict(patient, top_k=top_k)
    except PatientInputError as e:
        return JSONResponse(status_code=422, content={"errors": e.errors})
    except Exception:                                              # never leak internals
        log.exception("prediction failed")
        return JSONResponse(status_code=500, content={"errors": ["Prediction failed on the server."]})
