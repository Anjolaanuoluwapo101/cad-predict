"""
Which optional fields should become required (Option 1), and how much would a
lowered "borderline" cutoff help when fields are still missing (Option 4)?

Part 1 - greedy ranking. Start from the required (primary) fields. Try adding each
         optional field on its own, keep the one that removes the most yes/no
         disagreements with the full-data answer, then repeat.
Part 2 - cutoff sweep. For the base set and the extended set, lower each target's
         cutoff for the lazy form (x 0.9, 0.8 ...) and count missed / added patients.

Run from the cad-risk/ folder:
    python scripts/rank_optional_fields.py            # 10 greedy steps
    python scripts/rank_optional_fields.py --steps 6
It skips SHAP, so it is much faster than the previous script.
"""
import argparse
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore", category=UserWarning, module=r"sklearn\.utils\.parallel")

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path.cwd()))
from src.calibration import apply_calibrator  # noqa: E402
from src.predict import Predictor  # noqa: E402
from src.preprocess import encode, load_data  # noqa: E402


def probs_for(pred, full_inputs, keep):
    """Probabilities per target for every patient, using only the fields in `keep`
    (everything else gets its default). Same maths as Predictor.predict, minus SHAP."""
    rows = []
    for full in full_inputs:
        sub = {k: v for k, v in full.items() if k in keep}
        clean, _, _ = pred.resolve(sub)
        rows.append(pred.to_raw_row(clean))
    X = encode(pd.DataFrame(rows), pred.cfg)[pred.features]
    out = {}
    for t, b in pred.bundles.items():
        raw = b["pipeline"].predict_proba(X)[:, 1]
        out[t] = np.asarray(apply_calibrator(b["calibrator"], raw), dtype=float)
    return out


def errors(lazy, full, cut):
    res = {}
    for t, c in cut.items():
        a, b = lazy[t], full[t]
        res[t] = dict(
            flips=int(((a >= c) != (b >= c)).sum()),
            missed=int(((b >= c) & (a < c)).sum()),
            added=int(((b < c) & (a >= c)).sum()),
        )
    return res


def line(res, targets):
    return "  ".join(f"{t}:{res[t]['flips']:>3}({res[t]['missed']:>2}m)" for t in targets)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", type=int, default=10)
    args = ap.parse_args()

    pred = Predictor()
    df = load_data(pred.cfg)
    targets = list(pred.cfg["targets"])
    cut = {t: float(pred.bundles[t]["threshold"]) for t in targets}
    required = [n for n, s in pred.schema.items() if s["primary"]]
    optional = [n for n in pred.schema if n not in required]
    full_inputs = [pred.input_from_row(r) for _, r in df.iterrows()]
    all_fields = set(pred.schema)

    full = probs_for(pred, full_inputs, all_fields)
    base = probs_for(pred, full_inputs, set(required))

    # sanity check against the real predict() on patient 0
    chk = pred.predict({k: v for k, v in full_inputs[0].items() if k in required})
    diff = max(abs(chk["targets"][t]["probability"] - base[t][0]) for t in targets)
    print(f"{len(df)} patients | {len(required)} required | {len(optional)} optional")
    print(f"sanity check vs Predictor.predict (patient 0): max diff {diff:.4f}\n")

    print("Format: target: yes/no changes (missed)\n")
    print(f"{'BASE (required only)':<28}{line(errors(base, full, cut), targets)}\n")

    chosen, keep = [], set(required)
    for step in range(1, args.steps + 1):
        best = None
        for f in optional:
            if f in keep:
                continue
            e = errors(probs_for(pred, full_inputs, keep | {f}), full, cut)
            key = (sum(v["flips"] for v in e.values()), sum(v["missed"] for v in e.values()))
            if best is None or key < best[0]:
                best = (key, f, e)
        _, f, e = best
        keep.add(f)
        chosen.append(f)
        print(f"+{step:<2} {f:<24}{line(e, targets)}")

    print("\nAdd these to the required set, in this order:", chosen)

    def sweep(name, fields):
        lazy = probs_for(pred, full_inputs, fields)
        print(f"\nCutoff sweep, {name} (missed / added per target)")
        print(f"{'factor':<8}" + "".join(f"{t:>12}" for t in targets))
        for fac in (1.0, 0.9, 0.8, 0.7, 0.6, 0.5):
            cells = []
            for t in targets:
                a, b, c = lazy[t], full[t], cut[t]
                m = int(((b >= c) & (a < c * fac)).sum())
                ad = int(((b < c) & (a >= c * fac)).sum())
                cells.append(f"{m:>5}/{ad:<5}")
            print(f"{fac:<8}" + "".join(f"{x:>12}" for x in cells))

    sweep("base required set", set(required))
    sweep(f"required + {len(chosen)} added", keep)
    print("\nfactor 0.8 means: the lazy form says 'positive' from 80% of the normal cutoff.")
    print("Models were trained on these same patients, so all numbers are optimistic.")


if __name__ == "__main__":
    main()
