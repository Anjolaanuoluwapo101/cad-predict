// Risk presentation helpers shared by the 3D stage, the cards and the charts.
// colour_score (0-1) comes from the API already calibrated against each model's own threshold.

const STOPS = [
  [0.0, [31, 157, 143]],   // teal    - lower likelihood
  [0.5, [224, 163, 58]],   // amber   - borderline
  [1.0, [210, 68, 79]],    // crimson - elevated
];

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

export function riskRgb(score) {
  const s = Math.min(1, Math.max(0, Number(score) || 0));
  for (let i = 1; i < STOPS.length; i++) {
    const [p1, c1] = STOPS[i];
    const [p0, c0] = STOPS[i - 1];
    if (s <= p1) return mix(c0, c1, (s - p0) / (p1 - p0));
  }
  return STOPS[STOPS.length - 1][1];
}

export const riskColour = (score) => `rgb(${riskRgb(score).join(',')})`;
export const riskHex = (score) =>
  '#' + riskRgb(score).map((v) => v.toString(16).padStart(2, '0')).join('');

export const STATUS = {
  negative: 'Lower likelihood',
  borderline: 'Borderline',
  positive: 'Elevated likelihood',
};
export const statusLabel = (s) => STATUS[s] ?? 'Not determined';

// `mesh` is the node name inside heart_groningen_split.glb. CAD is the overall result, not a vessel.
export const TARGETS = {
  CAD: { name: 'Coronary artery disease', short: 'Overall', mesh: null },
  LAD: { name: 'Left anterior descending', short: 'LAD', mesh: 'LAD' },
  LCX: { name: 'Left circumflex', short: 'LCX', mesh: 'LCX' },
  RCA: { name: 'Right coronary artery', short: 'RCA', mesh: 'RCA' },
};
export const TARGET_ORDER = ['CAD', 'LAD', 'LCX', 'RCA'];

// Never print a model score as a certainty.
export function formatProb(p) {
  if (p >= 0.995) return '>99%';
  if (p < 0.005) return '<1%';
  return `${Math.round(p * 100)}%`;
}
