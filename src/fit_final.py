"""Step 4b: fit the chosen model per target on ALL patients and save it.

  python -m src.fit_final

Needs reports/final_config.json (from src.evaluate) and reports/oof_probs.csv.
Writes models/<TARGET>.joblib and models/metadata.json

Each .joblib holds a plain dict:
  pipeline   fitted Pipeline(prep -> classifier)      raw probability
  calibrator fitted Platt scaler                      raw -> calibrated probability
  threshold  yes/no cutoff on the calibrated probability
  features   column names the pipeline expects
"""
import json
import platform

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.pipeline import Pipeline

from src.calibration import apply_calibrator, fit_calibrator
from src.models import make_models
from src.preprocess import ROOT, build_prep, get_xy, load_config, load_data

cfg = load_config()
df = load_data(cfg)
final = json.loads((ROOT / "reports/final_config.json").read_text())
oof = pd.read_csv(ROOT / "reports/oof_probs.csv")
(ROOT / "models").mkdir(exist_ok=True)

for target, info in final.items():
    X, y = get_xy(df, target, cfg)
    pipe = Pipeline([("prep", build_prep(cfg, X.columns)),
                     ("clf", make_models(cfg["seed"])[info["model"]])])
    pipe.fit(X, y)

    d = oof[(oof.target == target) & (oof.model == info["model"])]
    cal = fit_calibrator(d.p.values, d.y.values)

    bundle = dict(target=target, model_name=info["model"], pipeline=pipe, calibrator=cal,
                  threshold=info["threshold"], features=list(X.columns))
    joblib.dump(bundle, ROOT / f"models/{target}.joblib")

    raw = pipe.predict_proba(X)[:, 1]
    p = apply_calibrator(cal, raw)
    print(f"{target}: {info['model']:7s} cutoff={info['threshold']:.3f}  "
          f"mean calibrated risk={p.mean():.3f} (true rate {y.mean():.3f})")

(ROOT / "models/metadata.json").write_text(json.dumps(dict(
    python=platform.python_version(), sklearn=sklearn.__version__, numpy=np.__version__,
    pandas=pd.__version__, joblib=joblib.__version__, seed=cfg["seed"], models=final), indent=2))
print("saved models/*.joblib and models/metadata.json")
