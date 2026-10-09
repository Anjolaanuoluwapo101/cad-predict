// Builds the compact CASE text Heartly sends with every question (about 500 tokens).
// Short on purpose: Groq's free tier is limited per minute, and the same text rides along with every message.
import { TARGETS, TARGET_ORDER, formatProb, statusLabel } from './risk';
import { formatValue, nameOf, pct, fieldMap } from './present';

const DRIVERS = 5;
const pc = (v) => `${Math.round(v * 100)}%`;

export function buildBrief(result, labels, fields) {
  const fmap = fieldMap(fields ?? []);
  const used = new Set(result.defaults_used ?? []);
  const lines = TARGET_ORDER.map((k) => {
    const t = result.targets[k];
    const band = t.borderline_from < t.threshold - 0.004 ? `borderline ${pc(t.borderline_from)}-${pc(t.threshold)}, ` : '';
    return `${TARGETS[k].name} (${k}): ${formatProb(t.probability)}, ${statusLabel(t.status)}; ${band}cut-off ${pc(t.threshold)}`;
  });
  const drivers = TARGET_ORDER.map((k) => {
    const items = result.targets[k].contributions.slice(0, DRIVERS).map((c) => {
      const val = formatValue(c.feature, c.value, fmap[c.feature]);
      return `${nameOf(c, labels)}=${used.has(c.feature) ? '~' : ''}${val} ${c.shap > 0 ? 'raises' : 'lowers'} ${pct(c.share)}`;
    });
    return `${k}: ${items.join('; ')}`;
  });
  const parts = [
    'SCORES', ...lines,
    'TOP FACTORS (~ means value was assumed, not entered)', ...drivers,
  ];
  if (used.size) parts.push(`NOT ENTERED, typical values assumed: ${[...used].map((n) => labels[n] ?? n).join(', ')}`);
  if (result.derived?.BMI) parts.push(`BMI ${result.derived.BMI} (calculated)`);
  return parts.join('\n');
}
