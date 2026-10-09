"""
Does requiring only the key (primary) fields change the predictions?

For every patient in the dataset we score them twice with src.predict.Predictor:
  A) only the REQUIRED (primary) fields -> every other field gets its default
  B) every form field                   -> no guessing at all
and compare A with B for each target (CAD, LAD, LCX, RCA).

Run from the cad-risk/ folder:
    python scripts/test_required_fields.py
(it can take a few minutes: every predict() call also computes SHAP.)
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path.cwd()))
from src.predict import PatientInputError, Predictor  # noqa: E402
from src.preprocess import load_data  # noqa: E402

OUT = "required_fields_test.csv"


def main():
    pred = Predictor()
    df = load_data(pred.cfg)
    required = [n for n, s in pred.schema.items() if s["primary"]]
    targets = list(pred.cfg["targets"])
    print(f"{len(df)} patients | {len(pred.schema)} form fields | "
          f"{len(required)} required (primary) fields\n")

    rows, skipped, cutoffs = [], [], {}
    for n, (idx, raw) in enumerate(df.iterrows(), 1):
        try:
            full = pred.input_from_row(raw)                      # B: everything real
            minimal = {k: v for k, v in full.items() if k in required}   # A: required only
            a, b = pred.predict(minimal), pred.predict(full)
        except (PatientInputError, KeyError, StopIteration) as e:
            skipped.append((idx, str(e)[:120]))
            continue
        rec = {"patient": idx, "n_defaulted_in_A": len(a["defaults_used"])}
        for t in targets:
            cutoffs[t] = b["targets"][t]["threshold"]
            rec[f"{t}_min"] = a["targets"][t]["probability"]
            rec[f"{t}_full"] = b["targets"][t]["probability"]
        rows.append(rec)
        if n % 50 == 0:
            print(f"  scored {n}/{len(df)}")

    res = pd.DataFrame(rows)
    res.to_csv(OUT, index=False)

    print(f"\n{len(res)} patients scored, {len(skipped)} skipped\n")
    print(f"{'target':<6}{'cutoff':>7}{'mean|diff|':>11}{'max|diff|':>10}{'corr':>7}"
          f"{'flips':>7}{'flip %':>8}{'missed':>8}{'added':>7}")
    for t in targets:
        a, b, c = res[f"{t}_min"], res[f"{t}_full"], cutoffs[t]
        diff = (a - b).abs()
        flips = int(((a >= c) != (b >= c)).sum())
        missed = int(((b >= c) & (a < c)).sum())   # full data says yes, minimal says no
        added = int(((b < c) & (a >= c)).sum())    # full data says no, minimal says yes
        print(f"{t:<6}{c:>7.2f}{diff.mean():>11.3f}{diff.max():>10.3f}"
              f"{np.corrcoef(a, b)[0, 1]:>7.3f}{flips:>7}{100 * flips / len(res):>7.1f}%"
              f"{missed:>8}{added:>7}")

    if skipped:
        print("\nSkipped patients (first 5):")
        for idx, msg in skipped[:5]:
            print(f"  row {idx}: {msg}")
    print(f"\nPer-patient scores saved to {OUT}")
    print("flips = yes/no answer changes | missed = positive with full data, negative with required only")
    print("added = negative with full data, positive with required only | corr = 1.0 means identical ranking")
    print("Note: models were trained on these same patients, so the result is optimistic.")


if __name__ == "__main__":
    main()
