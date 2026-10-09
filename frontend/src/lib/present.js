// Turning model output into words and numbers a clinician can read. Pure functions, no React.
import { ORD, UI, isSet } from './fields';
import { REF } from './hints';

// "35 %" reads wrong; "58 years" needs the space.
const unitSuffix = (u) => (!u ? '' : u === '%' ? '%' : ` ${u}`);
const VHD_NAMES = ['None', 'Mild', 'Moderate', 'Severe'];

export const fieldMap = (fields) => Object.fromEntries(fields.map((f) => [f.name, f]));

// The patient's value for one model input, in words. `f` is the form field (may be missing for derived inputs).
export function formatValue(feature, value, f) {
  if (!isSet(value)) return '-';
  if (feature === 'Male') return value ? 'Male' : 'Female';
  if (feature === 'BBB_LBBB' || feature === 'BBB_RBBB') return value ? 'Present' : 'Absent';
  if (feature === 'VHD') return VHD_NAMES[Math.round(value)] ?? String(value);
  if (ORD[feature]) return ORD[feature].names[Math.round(value)] ?? String(value);
  if (feature === 'BMI') return `${Number(value).toFixed(1)} kg/m²`;
  if (f?.kind === 'bin') return value ? 'Yes' : 'No';
  const dec = UI[feature]?.dec ?? (Number.isInteger(value) ? 0 : 1);
  return `${Number(value).toFixed(dec)}${unitSuffix(f?.unit)}`;
}

// Where the value sits against the typical adult range. Wording stays neutral: never "abnormal".
export function refStatus(feature, value) {
  const r = REF[feature];
  if (!r || !isSet(value)) return null;
  if (r.lo != null && value < r.lo) return 'below';
  if (r.hi != null && value > r.hi) return 'above';
  return 'within';
}

export function refText(feature, unit) {
  const r = REF[feature];
  if (!r) return null;
  const u = unitSuffix(unit);
  if (r.lo == null) return `below ${r.hi}${u}`;
  if (r.hi == null) return `${r.lo}${u} or above`;
  return `${r.lo} to ${r.hi}${u}`;
}

// Share of the model's explanation, as a percentage string.
export function pct(share) {
  const p = share * 100;
  return p < 1 ? '<1%' : `${Math.round(p)}%`;
}

// Biggest factors pushing the score up or down, by contribution share.
export function drivers(contribs, dir, n) {
  const want = dir === 'up' ? (c) => c.shap > 0 : (c) => c.shap < 0;
  return contribs.filter(want).sort((a, b) => b.share - a.share).slice(0, n);
}

export const nameOf = (c, labels) => labels[c.feature] ?? c.label ?? c.feature;
