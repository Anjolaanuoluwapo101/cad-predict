import { formatProb, riskColour, statusLabel } from '../lib/risk';

// Half-circle gauge. The three faint zones are this target's own Lower / Borderline / Elevated bands;
// the solid arc runs from 0 to the score. All coordinates are in a 200 x 118 box.
const CX = 100; const CY = 100; const R = 78;
const at = (p, r = R) => { const a = Math.PI * (1 - p); return [CX + r * Math.cos(a), CY - r * Math.sin(a)]; };
const f2 = (n) => n.toFixed(2);
const arc = (p0, p1) => {
  const [x0, y0] = at(p0); const [x1, y1] = at(p1);
  return `M ${f2(x0)} ${f2(y0)} A ${R} ${R} 0 ${p1 - p0 > 0.5 ? 1 : 0} 1 ${f2(x1)} ${f2(y1)}`;
};
const clamp01 = (n) => Math.min(0.999, Math.max(0.001, n));

export default function Gauge({ t, size = 'md' }) {
  const lo = clamp01(t.borderline_from); const cut = clamp01(t.threshold); const p = clamp01(t.probability);
  const hasBand = cut - lo > 0.004;
  const tick = (v) => { const [a, b] = at(v, R - 11); const [c, d] = at(v, R + 11); return <line key={v} x1={f2(a)} y1={f2(b)} x2={f2(c)} y2={f2(d)} className="g-tick" />; };
  const label = `Score ${formatProb(t.probability)}, ${statusLabel(t.status)}. Elevated from ${Math.round(t.threshold * 100)}%.`;
  return (
    <svg className={`gauge ${size}`} viewBox="0 0 200 118" role="img" aria-label={label}>
      <path d={arc(0.001, hasBand ? lo : cut)} className="g-zone" stroke={riskColour(0)} />
      {hasBand && <path d={arc(lo, cut)} className="g-zone" stroke={riskColour(0.5)} />}
      <path d={arc(cut, 0.999)} className="g-zone" stroke={riskColour(1)} />
      <path d={arc(0.001, p)} className="g-fill" stroke={riskColour(t.colour_score)} />
      {hasBand && tick(lo)}{tick(cut)}
      <text x="100" y="92" textAnchor="middle" className="g-val num">{formatProb(t.probability)}</text>
    </svg>
  );
}
