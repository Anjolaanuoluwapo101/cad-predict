"""Step 5a: one patient in -> probabilities, flags and SHAP contributions out.

    from src.predict import Predictor
    pred = Predictor()                      # load models once (slow part)
    result = pred.predict({"Age": 63, "Sex": "Male", "Typical Chest Pain": 1}) 

Anything the caller leaves out (out of the primary required fields ) is filled with the training-data default
(median for numbers, most common answer for yes/no and choices) and reported
back in `defaults_used`, so nothing is silently invented.
"""
import json
import math

import joblib
import numpy as np
import pandas as pd

from src.calibration import apply_calibrator
from src.explain import explain_values, make_explainer
from src.preprocess import ROOT, encode, get_xy, load_config, load_data
from src.schema import EXTRA_LABELS, FIELDS, build_schema

DISCLAIMER = ("Decision support and educational use only. Predictions are not a substitute "
              "for formal diagnostic imaging or clinical judgement.")
_YES = {"y", "yes", "true", "1", "t"}
_NO = {"n", "no", "false", "0", "f"}

# When any optional field is left blank, results from this fraction of the cutoff upward
# are reported as "borderline" (tuned with scripts/rank_optional_fields.py; RCA needs a wider band).
BORDERLINE_FACTOR = {"CAD": 0.9, "LAD": 0.9, "LCX": 0.9, "RCA": 0.8}


class PatientInputError(ValueError):
    """Raised with ALL problems found in the input, not just the first."""
    def __init__(self, errors):
        self.errors = list(errors)
        super().__init__("; ".join(self.errors))


def colour_score(p, threshold):
    """0 = green, 0.5 = amber, 1 = red, with amber exactly at the target's own cutoff."""
    if p <= threshold:
        return 0.5 * p / threshold
    return 0.5 + 0.5 * (p - threshold) / (1 - threshold)


class Predictor:
    def __init__(self):
        self.cfg = load_config()
        df = load_data(self.cfg)
        self.schema = build_schema(df)
        self.labels = {n: s["label"] for n, s in self.schema.items()} | EXTRA_LABELS
        self.bundles, self.explainers = {}, {}
        for t in self.cfg["targets"]:
            b = joblib.load(ROOT / f"models/{t}.joblib")
            X, _ = get_xy(df, t, self.cfg)
            Xt = b["pipeline"].named_steps["prep"].transform(X[b["features"]])
            self.bundles[t], self.explainers[t] = b, make_explainer(b, Xt)
        feats = {tuple(b["features"]) for b in self.bundles.values()}
        assert len(feats) == 1, "targets disagree on feature order"
        self.features = list(next(iter(feats)))
        self.meta = json.loads((ROOT / "models/metadata.json").read_text())

    # ---- input handling ---------------------------------------------------
    def _clean(self, spec, value, errors):
        name, kind = spec["name"], spec["kind"]
        if kind == "bin":
            v = str(value).strip().lower()
            if v in _YES: return 1
            if v in _NO: return 0
            errors.append(f"{name}: expected yes/no, got {value!r}")
        elif kind == "cat":
            hit = [k for k in spec["choices"] if k.lower() == str(value).strip().lower()]
            if hit: return hit[0]
            errors.append(f"{name}: expected one of {list(spec['choices'])}, got {value!r}")
        else:
            try:
                v = float(value)
                if not math.isfinite(v): raise ValueError
            except (TypeError, ValueError):
                errors.append(f"{name}: expected a number, got {value!r}"); return None
            lo, hi = spec.get("hard", (0, math.inf))
            if not lo <= v <= hi:
                errors.append(f"{name}: {v:g} is outside the allowed range [{lo}, {hi}]"); return None
            if kind == "ord" and v != int(v):
                errors.append(f"{name}: expected a whole number, got {v:g}"); return None
            return v
        return None

    def resolve(self, inputs, require_primary=True):
        """-> (clean values by form name, defaults_used, warnings). Raises PatientInputError.

        Primary fields (the ones the form shows) are REQUIRED by default: filling them
        with dataset medians/modes would invent a patient (the 'average' answers for
        chest pain and hypertension together look like a sick patient).
        Secondary fields default to 'absent' / the training median and are reported."""
        inputs = {k: v for k, v in (inputs or {}).items() if v is not None and v != ""}
        errors = [f"unknown field: {k!r}" for k in inputs if k not in self.schema]
        clean, defaults, warnings = {}, [], []
        for name, spec in self.schema.items():
            if name in inputs:
                v = self._clean(spec, inputs[name], errors)
                if v is None: continue
                lo, hi = spec.get("observed", (-math.inf, math.inf))
                if spec["kind"] == "num" and not lo <= v <= hi:
                    warnings.append(f"{spec['label']} = {v:g} is outside the training range "
                                    f"[{lo:g}, {hi:g}]; the prediction extrapolates.")
                clean[name] = v
            else:
                if spec["primary"] and require_primary:
                    errors.append(f"{name}: required")
                clean[name] = spec["default"]; defaults.append(name)
        if errors: raise PatientInputError(errors)
        missing = [spec["label"] for n, spec in self.schema.items() if spec["primary"] and n in defaults]
        if missing:
            warnings.append("Key fields were not provided and set to dataset defaults: " + ", ".join(missing))
        return clean, defaults, warnings

    def to_raw_row(self, clean):
        """Clean values -> one row in the dataset's own raw format (BMI/Obesity derived)."""
        row = {}
        for name, spec in self.schema.items():
            v = clean[name]
            if spec["kind"] == "bin":
                row[name] = v if spec["raw_numeric"] else ("Y" if v else "N")
            elif spec["kind"] == "cat":
                row[name] = spec["choices"][v]
            else:
                row[name] = v
        bmi = clean["Weight"] / (clean["Length"] / 100) ** 2
        row["BMI"] = bmi
        row["Obesity"] = "Y" if round(bmi, 6) >= 25 else "N"   # dataset rule: BMI >= 25
        return row

    def encode_inputs(self, inputs, require_primary=True):
        """Form values -> the exact 55-column model input (plus defaults/warnings)."""
        clean, defaults, warnings = self.resolve(inputs, require_primary)
        X = encode(pd.DataFrame([self.to_raw_row(clean)]), self.cfg)[self.features]
        assert not X.isna().any().any()
        return X, clean, defaults, warnings

    # ---- prediction -------------------------------------------------------
    def predict(self, inputs, top_k=8, require_primary=True):
        X, clean, defaults, warnings = self.encode_inputs(inputs, require_primary)
        if defaults:
            warnings = list(warnings) + [
                f"{len(defaults)} optional fields were not provided and used dataset defaults. "
                "Risk may be under-estimated, so results slightly below the cutoff are shown as "
                "'borderline'. Fill in more fields for a firmer estimate."]
        targets = {}
        for t, b in self.bundles.items():
            pipe = b["pipeline"]
            raw = float(pipe.predict_proba(X)[:, 1][0])
            p = float(apply_calibrator(b["calibrator"], [raw])[0])
            thr = float(b["threshold"])
            Xt = pipe.named_steps["prep"].transform(X)
            sv = explain_values(self.explainers[t], Xt)[0]
            total = float(np.abs(sv).sum()) or 1.0
            order = np.argsort(-np.abs(sv))[:top_k]
            positive = bool(p >= thr)
            band_from = thr * BORDERLINE_FACTOR.get(t, 0.9) if defaults else thr
            status = "positive" if positive else ("borderline" if p >= band_from else "negative")
            targets[t] = dict(
                probability=round(p, 4), predicted_positive=positive,
                status=status, borderline_from=round(float(band_from), 4),
                threshold=round(thr, 4), colour_score=round(colour_score(p, thr), 4),
                model=b["model_name"],
                explanation_units="probability" if b["model_name"] == "rf" else "log-odds",
                contributions=[dict(
                    feature=Xt.columns[i], label=self.labels.get(Xt.columns[i], Xt.columns[i]),
                    value=float(X.iloc[0][Xt.columns[i]]), shap=round(float(sv[i]), 5),
                    share=round(float(abs(sv[i]) / total), 4),
                    direction="increases risk" if sv[i] > 0 else "decreases risk") for i in order])
        return dict(targets=targets, defaults_used=defaults, warnings=warnings,
                    derived=dict(BMI=round(float(X.iloc[0].get("BMI", np.nan)), 2),
                                 bmi_over_25=bool(X.iloc[0].get("Obesity", 0))),
                    disclaimer=DISCLAIMER,
                    model_info=dict(sklearn=self.meta["sklearn"], numpy=self.meta["numpy"]))

    def form_spec(self):
        """Everything the web form needs: fields, groups, units, defaults, ranges."""
        keep = ("name", "label", "group", "kind", "unit", "primary", "default", "observed", "hard")
        out = []
        for s in self.schema.values():
            d = {k: s[k] for k in keep if k in s}
            if "choices" in s: d["choices"] = list(s["choices"])
            out.append(d)
        return out

    def input_from_row(self, raw_row):
        """A row of the original dataset -> form values (for 'load example patient')."""
        out = {}
        for name, spec in self.schema.items():
            v = raw_row[name]
            if spec["kind"] == "bin":
                out[name] = int(v == 1 or v == "Y")
            elif spec["kind"] == "cat":
                out[name] = next(k for k, r in spec["choices"].items() if r.lower() == str(v).lower())
            else:
                out[name] = float(v)
        return out
