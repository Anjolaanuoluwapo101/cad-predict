// How each field is presented. Slider limits are for the slider only; typed values may go beyond them.
export const UI = {
  Age: { min: 20, max: 90 }, Weight: { min: 40, max: 150 }, Length: { min: 135, max: 200 },
  BP: { min: 80, max: 220 }, PR: { min: 40, max: 140 }, 'EF-TTE': { min: 10, max: 75 },
  FBS: { min: 60, max: 400 }, CR: { min: 0.4, max: 3, step: 0.1, dec: 1 }, TG: { min: 30, max: 600, step: 5 },
  LDL: { min: 20, max: 240 }, HDL: { min: 15, max: 110 }, BUN: { min: 5, max: 60 }, ESR: { min: 1, max: 100 },
  HB: { min: 8, max: 18, step: 0.1, dec: 1 }, K: { min: 3, max: 6.5, step: 0.1, dec: 1 }, Na: { min: 125, max: 155 },
  WBC: { min: 3500, max: 18000, step: 100 }, Lymph: { min: 5, max: 60 }, Neut: { min: 30, max: 90 },
  PLT: { min: 50, max: 500, step: 5 },
};
export const CAT_LABEL = { N: 'None' };

export const isSet = (v) => v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && Number.isNaN(v));
export const bmiOf = (w, h) => (isSet(w) && isSet(h) && h > 0 ? w / ((h / 100) ** 2) : null);

export function hardProblem(f, v) {
  if (f.kind === 'bin' || f.kind === 'cat' || !isSet(v)) return null;
  if (f.hard && (v < f.hard[0] || v > f.hard[1])) return `Must be between ${f.hard[0]} and ${f.hard[1]}${f.unit ? ' ' + f.unit : ''}`;
  if (!f.hard && v <= 0) return 'Must be greater than 0';
  return null;
}

// Only fields the clinician actually set are sent; the API fills the rest and reports which.
export function toPayload(fields, values) {
  const out = {};
  fields.forEach((f) => { if (isSet(values[f.name])) out[f.name] = values[f.name]; });
  return out;
}

// Clearer names and plain-language levels for the two ordinal scales.
export const LABELS = {
  'Function Class': 'Activity limitation (functional class)',
  'Region RWMA': 'Wall motion abnormality (regions affected)',
};
export const ORD = {
  'Function Class': {
    names: ['None', 'Slight', 'Marked', 'At rest'],
    notes: [
      'No limitation of physical activity.',
      'Slight limitation: ordinary activity causes symptoms such as breathlessness or chest discomfort.',
      'Marked limitation: less than ordinary activity causes symptoms.',
      'Symptoms at rest, or with any activity.',
    ],
    help: 'Choose the level that best describes how symptoms limit daily activity.',
  },
  'Region RWMA': {
    names: ['None', '1', '2', '3', '4'],
    notes: ['No heart-wall regions with abnormal motion on echo.', ...[1, 2, 3, 4].map((n) => `${n} heart-wall ${n === 1 ? 'region' : 'regions'} with abnormal motion on echo.`)],
    help: 'Number of heart-wall regions that move abnormally on echocardiography.',
  },
};

// Fields shown in their own block at the end of a step, with a caption that ties them to the fields above.
export const SUB = {
  Symptoms: {
    names: ['Function Class'],
    title: 'Effect on daily activity',
    caption: 'Thinking about the symptoms above, how much do they limit everyday activity?',
  },
};

// Alternative lab units. Values are always stored and sent in the model's units; m converts stored to shown.
export const ALT = {
  FBS: { unit: 'mmol/L', m: 1 / 18.016, dec: 1, step: 0.1 },
  CR: { unit: 'µmol/L', m: 88.4, dec: 0, step: 1 },
  TG: { unit: 'mmol/L', m: 1 / 88.57, dec: 2, step: 0.05 },
  LDL: { unit: 'mmol/L', m: 1 / 38.67, dec: 2, step: 0.05 },
  HDL: { unit: 'mmol/L', m: 1 / 38.67, dec: 2, step: 0.05 },
  BUN: { unit: 'mmol/L urea', m: 1 / 2.801, dec: 1, step: 0.1 },
};
