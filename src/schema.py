"""The patient input form, described once.

Used by the API (validation, the /features endpoint that builds the web form)
and by src/predict.py (turning a form into the dataset's raw format).

kind:  num  = a measured number          ord = a small whole-number scale
       bin  = yes/no                     cat = pick one of `choices`
primary: REQUIRED in the form. Started as the union of each target's top-10 SHAP
         features plus Height (needed to derive BMI), then extended with the 10 optional
         fields (HDL, K, VHD, HB, PR, Current Smoker, FH, WBC, DLP, St Depression) that
         removed the most yes/no disagreements between a required-only form and a
         full form (see scripts/rank_optional_fields.py).
BMI and Obesity are NOT inputs: they are derived from Weight and Height.
"""
import pandas as pd

SEX = {"Male": "Male", "Female": "Fmale"}                       # dataset spells it "Fmale"
BBB = {"N": "N", "LBBB": "LBBB", "RBBB": "RBBB"}
VHD = {"N": "N", "Mild": "mild", "Moderate": "Moderate", "Severe": "Severe"}   # file's spellings

#            name                  label                           group         kind  unit    primary  extra
_F = [
 ("Age",                  "Age",                            "Demographics", "num", "years",   True,  dict(hard=(0, 120))),
 ("Sex",                  "Sex",                            "Demographics", "cat", "",        True,  dict(choices=SEX)),
 ("Weight",               "Weight",                         "Demographics", "num", "kg",      True,  dict(hard=(20, 300))),
 ("Length",               "Height",                         "Demographics", "num", "cm",      True,  dict(hard=(100, 230))),
 ("DM",                   "Diabetes mellitus",              "History",      "bin", "",        True,  {}),
 ("HTN",                  "Hypertension",                   "History",      "bin", "",        True,  {}),
 ("Current Smoker",       "Current smoker",                 "History",      "bin", "",        True, {}),
 ("EX-Smoker",            "Ex-smoker",                      "History",      "bin", "",        False, {}),
 ("FH",                   "Family history of CAD",          "History",      "bin", "",        True, {}),
 ("CRF",                  "Chronic renal failure",          "History",      "bin", "",        False, {}),
 ("CVA",                  "Cerebrovascular accident",       "History",      "bin", "",        False, {}),
 ("Airway disease",       "Airway disease",                 "History",      "bin", "",        False, {}),
 ("Thyroid Disease",      "Thyroid disease",                "History",      "bin", "",        False, {}),
 ("CHF",                  "Congestive heart failure",       "History",      "bin", "",        False, {}),
 ("DLP",                  "Dyslipidaemia",                  "History",      "bin", "",        True, {}),
 ("BP",                   "Blood pressure (systolic)",      "Examination",  "num", "mmHg",    True,  dict(hard=(40, 300))),
 ("PR",                   "Pulse rate",                     "Examination",  "num", "bpm",     True, dict(hard=(20, 250))),
 ("Edema",                "Oedema",                         "Examination",  "bin", "",        False, {}),
 ("Weak Peripheral Pulse","Weak peripheral pulse",          "Examination",  "bin", "",        False, {}),
 ("Lung rales",           "Lung rales",                     "Examination",  "bin", "",        False, {}),
 ("Systolic Murmur",      "Systolic murmur",                "Examination",  "bin", "",        False, {}),
 ("Diastolic Murmur",     "Diastolic murmur",               "Examination",  "bin", "",        False, {}),
 ("Typical Chest Pain",   "Typical chest pain",             "Symptoms",     "bin", "",        True,  {}),
 ("Atypical",             "Atypical chest pain",            "Symptoms",     "bin", "",        True,  {}),
 ("Nonanginal",           "Non-anginal chest pain",         "Symptoms",     "bin", "",        False, {}),
 ("LowTH Ang",            "Low-threshold angina",           "Symptoms",     "bin", "",        False, {}),
 ("Dyspnea",              "Dyspnoea",                       "Symptoms",     "bin", "",        True,  {}),
 ("Function Class",       "Functional class (0-3)",         "Symptoms",     "ord", "",        True,  dict(hard=(0, 3))),
 ("Q Wave",               "Q wave",                         "ECG",          "bin", "",        False, {}),
 ("St Elevation",         "ST elevation",                   "ECG",          "bin", "",        False, {}),
 ("St Depression",        "ST depression",                  "ECG",          "bin", "",        True, {}),
 ("Tinversion",           "T-wave inversion",               "ECG",          "bin", "",        True,  {}),
 ("LVH",                  "Left ventricular hypertrophy",   "ECG",          "bin", "",        False, {}),
 ("Poor R Progression",   "Poor R-wave progression",        "ECG",          "bin", "",        False, {}),
 ("BBB",                  "Bundle branch block",            "ECG",          "cat", "",        False, dict(choices=BBB)),
 ("EF-TTE",               "Ejection fraction",              "Echo",         "num", "%",       True,  dict(hard=(5, 80))),
 ("Region RWMA",          "Regional wall motion abnormality (0-4)", "Echo", "ord", "",        True,  dict(hard=(0, 4))),
 ("VHD",                  "Valvular heart disease",         "Echo",         "cat", "",        True, dict(choices=VHD)),
 ("FBS",                  "Fasting blood sugar",            "Laboratory",   "num", "mg/dL",   True,  {}),
 ("CR",                   "Creatinine",                     "Laboratory",   "num", "mg/dL",   True,  {}),
 ("TG",                   "Triglycerides",                  "Laboratory",   "num", "mg/dL",   True,  {}),
 ("LDL",                  "LDL cholesterol",                "Laboratory",   "num", "mg/dL",   True,  {}),
 ("HDL",                  "HDL cholesterol",                "Laboratory",   "num", "mg/dL",   True, {}),
 ("BUN",                  "Blood urea nitrogen",            "Laboratory",   "num", "mg/dL",   True,  {}),
 ("ESR",                  "Erythrocyte sedimentation rate", "Laboratory",   "num", "mm/h",    True,  {}),
 ("HB",                   "Haemoglobin",                    "Laboratory",   "num", "g/dL",    True, {}),
 ("K",                    "Potassium",                      "Laboratory",   "num", "mEq/L",   True, {}),
 ("Na",                   "Sodium",                         "Laboratory",   "num", "mEq/L",   True,  {}),
 ("WBC",                  "White blood cells",              "Laboratory",   "num", "cells/µL", True, {}),
 ("Lymph",                "Lymphocytes",                    "Laboratory",   "num", "%",       True,  {}),
 ("Neut",                 "Neutrophils",                    "Laboratory",   "num", "%",       True,  {}),
 ("PLT",                  "Platelets",                      "Laboratory",   "num", "x1000/µL", True, {}),
]
FIELDS = [dict(name=n, label=l, group=g, kind=k, unit=u, primary=p, **x) for n, l, g, k, u, p, x in _F]

# labels for the model's own (encoded) column names that differ from the form
EXTRA_LABELS = {"Male": "Male sex", "BBB_LBBB": "Left bundle branch block", "BBB_RBBB": "Right bundle branch block",
                "BMI": "BMI", "Obesity": "BMI over 25 (dataset 'Obesity')"}


def build_schema(df):
    """name -> spec, with defaults and observed training ranges taken from the data."""
    out = {}
    for f in FIELDS:
        s = dict(f)
        col = df[f["name"]]
        numeric_raw = pd.api.types.is_numeric_dtype(col)
        s["raw_numeric"] = bool(numeric_raw)                 # numeric 0/1 in the file, or "Y"/"N" text?
        if f["kind"] in ("num", "ord"):
            s["default"] = float(col.median())
            s["observed"] = (float(col.min()), float(col.max()))
        elif f["kind"] == "bin":
            s["default"] = int(((col == 1) if numeric_raw else (col == "Y")).mean() >= 0.5)
        else:
            # "not reported" = no disease/finding when the form has such a choice, else the most common answer
            mode_raw = col.mode()[0]
            s["default"] = "N" if "N" in f["choices"] else next(
                k for k, v in f["choices"].items() if v.lower() == str(mode_raw).lower())
        out[f["name"]] = s
    return out
