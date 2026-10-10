# Coronary Risk Assessment

An interactive web app for visualising coronary artery disease (CAD) risk per vessel —
overall CAD plus the LAD, LCX and RCA arteries — with a 3D heart, SHAP explanations
and an AI assistant that explains each assessment in plain language.

> **Decision support and educational use only.** Predictions are not a substitute
> for formal diagnostic imaging or clinical judgement.

## Features

- **Stepped intake form** — required fields start unset; optional fields live in a
  per-step "More detail" accordion. BMI is derived from weight + height, lab fields
  support mg/dL ↔ mmol/L unit toggles, and sliders show typical adult reference
  bands plus out-of-training-range warnings.
- **Vessel-specific scores** — every target has its own model, its own cut-off and
  its own Lower / Borderline / Elevated bands. Scores left blank on optional inputs
  use typical values and are flagged Borderline rather than Lower.
- **Interactive 3D heart** — orbit, click a vessel to focus it, Solo / hide / dim
  vessels, floating result labels, one-click Reset view.
- **Why this score** — SHAP bar chart of each factor's share of the explanation,
  with the plain-English caveat that shares describe the model, not proof of cause.
- **Measurements** — the values behind the score against typical adult ranges, with
  an "estimated" badge wherever a typical value was assumed.
- **Run history** — save the last 10 runs to browser localStorage. A `History`
  dropdown in the header reloads any run (inputs + results, editable), with
  per-run delete and clear-all.
- **Heartly assistant** — a floating Groq-powered chat that explains the current
  assessment. Bring a (throwaway) Groq API key; it stays in the browser tab only.
- **Light + dark themes**, probabilities shown as `>99%` / `<1%` at the extremes,
  and scores are never described as certainties.

## Quickstart

You need Python 3 (see `requirements.txt`) and Node 20+.

**1. Backend** — run from the repo root so `import src…` works:

```bash
pip install -r requirements.txt
uvicorn api.main:app --reload
```

The API serves at `http://127.0.0.1:8000` (`/docs` has a live console).
CORS allows `http://localhost:5173` and `http://127.0.0.1:5173` / `:8000` by default;
override with `CAD_ALLOWED_ORIGINS` when deploying.

**2. Frontend:**

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL (default `http://localhost:5173`). To point at a non-default API:

```bash
echo 'VITE_API_URL=http://127.0.0.1:8000' > .env.local
```

**3. Heartly (optional):** add `VITE_GROQ_API_KEY=<throwaway key>` to
`frontend/.env.local` (git-ignored), or paste a key into the Heartly panel when
prompted. Use a throwaway key and revoke it afterwards — a browser key is readable.

**4. Try it:** fill the required fields → *Run assessment* → explore the Overview /
Why / Measurements tabs and the 3D vessels → *Save run* to keep it in History.

## How to read a result

- **Score** — the model's estimate that the vessel is affected, as a percentage.
  A model output, not a diagnosis.
- **Cut-off** — the score at or above which the vessel reads *Elevated likelihood*.
  Every vessel has its own cut-off: compare each score with its own cut-off, never
  across vessels. The dark tick on the RiskBar marks it.
- **Borderline** — a band just below the cut-off. Optional fields left blank are
  filled with typical values, which can hide risk, so scores here are flagged for
  a closer look. Entering more detail gives a firmer estimate.
- **The bar** — faint zones are that vessel's Lower / Borderline / Elevated bands;
  the solid bar is the score.
- **Status wording** is always *Lower likelihood / Borderline / Elevated
  likelihood* — never "positive" / "negative" in the UI.

## Project structure

```text
cad-risk/
├── api/main.py            # FastAPI layer: /health, /features, /predict (no model logic)
├── src/
│   ├── schema.py          # the patient form, described once (fields, groups, defaults)
│   ├── preprocess.py      # stateless encoding + stateful impute/scale pipeline step
│   ├── models.py          # model zoo shared by training and final fit
│   ├── train_cv.py        # step 3: repeated stratified CV  → reports/cv_*.csv, oof_probs.csv
│   ├── evaluate.py        # step 4a: model choice, calibration, cut-offs → final_config.json
│   ├── fit_final.py       # step 4b: refit winners on all patients → models/*.joblib
│   ├── explain.py         # step 4c: SHAP tables/plots → reports/shap_*.csv
│   ├── predict.py         # step 5a: Predictor — one patient in, risks + SHAP out
│   ├── calibration.py     # Platt scaling, Youden cut-offs, metrics
│   └── audit.py           # step 1: data audit → reports/data_audit.md
├── frontend/src/
│   ├── App.jsx            # shell, header/history, run orchestration
│   ├── components/        # IntakeForm, Results, Overview, ShapChart, Physiology,
│   │                      # HeartStage (3D), Heartly (assistant), HistoryMenu, …
│   └── lib/               # api, fields, hints, risk, present, brief, groq, history, …
├── scripts/               # build-heart.mjs (GLB from BodyParts3D), analysis helpers
├── tests/                 # pytest: leakage, calibration, borderline, predict, API
├── models/                # trained bundles: CAD/LAD/LCX/RCA.joblib + metadata.json
├── config.yaml            # seed, dataset path, targets, CV grid
└── reports/               # generated metrics, SHAP tables, audit, plots
```

## Models & pipeline

- **Data:** 303 patients from a single centre (extension of the Z-Alizadeh Sani
  dataset, `data/raw/`). Small and single-centre — treat everything as demo-grade.
- **Targets:** CAD (overall) plus LAD / LCX / RCA stenosis, each with its own model.
- **Training:** repeated stratified cross-validation (5 splits × 5 repeats, seed 42);
  per-target winner chosen by mean AUC; Platt scaling and Youden cut-offs fitted
  *inside* inner folds so the reported metrics stay honest.
- **Explanations:** SHAP only. Random-forest SHAP values are in probability units;
  the RCA (logistic-regression) values are in log-odds — compare features *within*
  a target, not across targets.
- **Borderline rule:** when optional fields are defaulted, scores from 0.9× the
  cut-off upward (0.8× for RCA) read Borderline instead of Lower.

### Cross-validated performance (honest, but same-centre)

| Target | AUC (approx.) |
|--------|---------------|
| CAD    | 0.93          |
| LAD    | 0.84          |
| LCX    | 0.73          |
| RCA    | 0.72          |

LCX and RCA are weaker — the app and Heartly say so where relevant.

## API reference

| Method | Endpoint    | Notes                                                        |
|--------|-------------|--------------------------------------------------------------|
| GET    | `/health`   | server status, loaded targets, disclaimer                    |
| GET    | `/features` | form definition: fields, labels, units, defaults, `primary`  |
| POST   | `/predict`  | body: `{field: value}`, query `top_k` (1–20, default 8)      |

`POST /predict` returns `targets` (probability, status, threshold, colour score,
contributions), `defaults_used`, `warnings`, derived BMI and the disclaimer.
Missing/unknown/bad fields come back together as `422 {"errors": [...]}` so the
form can highlight every problem at once; server failures return 500 without
leaking internals. Run the suite with `pytest` from the repo root.

## Limitations & safety

- Trained on 303 single-centre patients: do not generalise to other populations.
- Defaulted inputs can under-estimate risk — that is exactly what the Borderline
  band and the "estimated" badges are for.
- Heartly is an LLM explainer, not a clinician: it can be wrong, never diagnoses,
  never recommends treatment, and declines non-assessment requests.
- Heart anatomy: BodyParts3D, © The Database Center for Life Science, licensed
  under CC Attribution-Share Alike 2.1 Japan.

## Further reading

- `frontend/BUILD_STATE.md` — frontend build log and design decisions.
- `reports/data_audit.md` — dataset audit; `reports/` also holds CV metrics and
  SHAP tables/plots.
- `docs/dev-notes/` — working notes from development.
